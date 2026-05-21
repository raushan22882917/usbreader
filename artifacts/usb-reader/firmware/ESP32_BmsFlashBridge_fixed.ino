/*
 * ESP32 BMS Flash Bridge — USB CDC newline JSON ↔ TWAI/CAN
 *
 *   {"cmd":"data","batch":0,"b64":"AQIDBA..."}              // preferred (~5.5 KB for 1024 frames)
 *   {"cmd":"data","batch":0,"from":64,"b64":"..."}          // partial retry
 *   {"cmd":"data","batch":0,"frames":[[d0,d1,d2,d3],...]}   // legacy (keep lines < 16 KB)
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESP32-TWAI-CAN.hpp>

#define UART_BAUD 115200

#define JSON_RX_DOC_B64 12288
#define JSON_RX_DOC_SMALL 8192
#define JSON_TX_DOC_SIZE 256
#define CDC_RX_LINE_MAX 20480

#define CAN_TX_PIN GPIO_NUM_21
#define CAN_RX_PIN GPIO_NUM_20
#define CAN_BITRATE_KBPS 500

#define ID_PING 0x069
#define ID_BUS 0x00B
#define ID_INFO 0x456

#define CMD_UNLOCK 0xA0
#define CMD_DATA 0xA1
#define CMD_VERIFY 0xA2
#define CMD_GO 0xA3

#define ACK_OK 0x50
#define ACK_CRC_OK 0x53

#define ACK_TIMEOUT_MS 2000
#define INFO_TIMEOUT_MS 5000
#define ANNOUNCE_TIMEOUT_MS 5000
#define CRC_TIMEOUT_MS 10000

#define BATCH_SIZE 1024
#define DATA_PER_FRAME 4

enum State {
  STATE_IDLE,
  STATE_HANDSHAKE,
  STATE_READY,
  STATE_DATA,
  STATE_VERIFY,
  STATE_COMPLETE,
  STATE_ERROR
};

State currentState = STATE_IDLE;
uint32_t totalFrames = 0;
uint32_t framesSent = 0;
uint32_t expectedCrc32 = 0;
String errorMsg = "";
uint32_t pacingUs = 500;
bool benchMode = false;

bool canInit() {
  return ESP32Can.begin(ESP32Can.convertSpeed(CAN_BITRATE_KBPS), CAN_TX_PIN,
                        CAN_RX_PIN, 10, 10);
}

void canStop() { ESP32Can.end(); }

void canRecover() {
  ESP32Can.end();
  delay(100);
  ESP32Can.begin(ESP32Can.convertSpeed(CAN_BITRATE_KBPS), CAN_TX_PIN,
                 CAN_RX_PIN, 10, 10);
}

void canFlushRx() {
  CanFrame tmp;
  while (ESP32Can.readFrame(tmp, 0)) {}
}

bool canTx(uint32_t id, const uint8_t *data, uint8_t len) {
  if (benchMode) {
    delayMicroseconds(300);
    return true;
  }

  CanFrame frame = {0};
  frame.identifier = id;
  frame.extd = 0;
  frame.rtr = 0;
  frame.data_length_code = len;
  memcpy(frame.data, data, len);

  if (!ESP32Can.writeFrame(frame, 5)) {
    if (ESP32Can.canState() == 2) canRecover();
    return false;
  }
  return true;
}

bool canRx(uint32_t expectedId, const uint8_t *expectedData,
           uint8_t expectedLen, uint32_t timeoutMs) {
  if (benchMode) {
    delay(5);
    return true;
  }

  uint32_t start = millis();
  CanFrame frame;

  uint32_t pollStart = micros();
  while (micros() - pollStart < 500) {
    if (ESP32Can.readFrame(frame, 0)) {
      if (frame.identifier == expectedId) {
        if (expectedData == NULL) return true;
        if (frame.data_length_code >= expectedLen) {
          bool match = true;
          for (uint8_t i = 0; i < expectedLen; i++) {
            if (frame.data[i] != expectedData[i]) {
              match = false;
              break;
            }
          }
          if (match) return true;
        }
      }
    }
  }

  while (millis() - start < timeoutMs) {
    uint32_t remaining = timeoutMs - (millis() - start);
    if (remaining == 0) break;
    uint32_t pollMs = remaining < 50 ? remaining : 50;
    if (ESP32Can.readFrame(frame, pollMs)) {
      if (frame.identifier == expectedId) {
        if (expectedData == NULL) return true;
        if (frame.data_length_code >= expectedLen) {
          bool match = true;
          for (uint8_t i = 0; i < expectedLen; i++) {
            if (frame.data[i] != expectedData[i]) {
              match = false;
              break;
            }
          }
          if (match) return true;
        }
      }
    }
    delay(1);
  }
  return false;
}

template <typename T>
void sendJsonResponse(T &doc) {
  char txBuf[JSON_TX_DOC_SIZE];
  size_t len = serializeJson(doc, txBuf, sizeof(txBuf));
  if (len < sizeof(txBuf) - 1) {
    txBuf[len++] = '\n';
    Serial.write((const uint8_t *)txBuf, len);
  } else {
    serializeJson(doc, Serial);
    Serial.println();
  }
  Serial.flush();
}

void sendReady() {
  StaticJsonDocument<JSON_TX_DOC_SIZE> doc;
  doc["status"] = "ready";
  doc["msg"] = "unlocked";
  sendJsonResponse(doc);
}

void sendBatchOk(uint32_t batch, uint32_t next, float progress) {
  StaticJsonDocument<JSON_TX_DOC_SIZE> doc;
  doc["status"] = "ok";
  doc["batch"] = batch;
  doc["next"] = next;
  doc["progress"] = ((int)(progress * 10.0f + 0.5f)) / 10.0f;
  sendJsonResponse(doc);
}

void sendRetry(uint32_t batch, uint32_t fromFrame) {
  StaticJsonDocument<JSON_TX_DOC_SIZE> doc;
  doc["status"] = "retry";
  doc["batch"] = batch;
  doc["from"] = fromFrame;
  sendJsonResponse(doc);
}

void sendError(const char *msg) {
  StaticJsonDocument<JSON_TX_DOC_SIZE> doc;
  doc["status"] = "error";
  doc["msg"] = msg;
  sendJsonResponse(doc);
  currentState = STATE_ERROR;
  errorMsg = msg;
}

void sendComplete() {
  StaticJsonDocument<JSON_TX_DOC_SIZE> doc;
  doc["status"] = "complete";
  sendJsonResponse(doc);
  currentState = STATE_COMPLETE;
}

void sendStatus() {
  StaticJsonDocument<JSON_TX_DOC_SIZE> doc;
  doc["state"] = (int)currentState;
  doc["frames_sent"] = framesSent;
  doc["total_frames"] = totalFrames;
  if (currentState == STATE_ERROR) doc["error"] = errorMsg;
  sendJsonResponse(doc);
}

bool doHandshake() {
  {
    uint8_t d[] = {0x69};
    bool ok = false;
    for (uint8_t i = 0; i < 3 && !ok; i++) {
      if (i > 0) delay(300);
      ok = canTx(ID_PING, d, 1);
    }
    if (!ok) { sendError("PING TX failed"); return false; }
    delay(150);
  }

  {
    uint8_t d[] = {0x69, 0x96, 0x69, 0x96, 0x69, 0x96, 0x69, 0x96};
    if (!canTx(ID_BUS, d, 8)) { sendError("SYNC TX failed"); return false; }
    delay(200);
  }

  {
    uint8_t d[] = {0xB1};
    canFlushRx();
    if (!canTx(ID_BUS, d, 1)) { sendError("ANNOUNCE TX failed"); return false; }
  }

  {
    uint8_t d[] = {CMD_UNLOCK, 0x00, 0xE2, 0x04, 0x00, 0x00, 0x02, 0x00};
    if (!canTx(ID_BUS, d, 8)) { sendError("UNLOCK TX failed"); return false; }
  }

  return true;
}

// CAN DATA: [A1 seq_lo 0xE2 0x04 d0 d1 d2 d3]
int sendBatchToCan(uint32_t startSeq, const uint8_t frames[][DATA_PER_FRAME],
                   uint16_t count) {
  for (uint16_t i = 0; i < count; i++) {
    uint32_t seq = startSeq + i;

    uint8_t canFrame[8] = {
      CMD_DATA,
      (uint8_t)(seq & 0xFF),
      0xE2,
      0x04,
      frames[i][0], frames[i][1], frames[i][2], frames[i][3]
    };

    if (!canTx(ID_BUS, canFrame, 8)) return (int)i;

    if (!benchMode && pacingUs > 0) delayMicroseconds(pacingUs);

    if (seq + 1 > framesSent) framesSent = seq + 1;
  }
  return -1;
}

void handleStart(uint32_t crc32, uint32_t total, uint32_t pacing, bool bench) {
  expectedCrc32 = crc32;
  totalFrames = total;
  pacingUs = pacing;
  benchMode = bench;
  framesSent = 0;
  currentState = STATE_HANDSHAKE;

  if (!doHandshake()) return;

  currentState = STATE_READY;
  sendReady();
}

static const int8_t b64Lut[128] = {
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,
    52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,
    -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,
    15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,
    -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
    41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1
};

int b64Decode(const char *input, uint8_t *output, size_t maxOut) {
  size_t len = strlen(input);
  while (len > 0 && input[len - 1] == '=') len--;

  size_t outLen = 0;
  uint32_t accum = 0;
  uint8_t bits = 0;

  for (size_t i = 0; i < len; i++) {
    uint8_t c = (uint8_t)input[i];
    if (c >= 128) return -1;
    int8_t val = b64Lut[c];
    if (val < 0) return -1;

    accum = (accum << 6) | (uint32_t)val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (outLen >= maxOut) return -1;
      output[outLen++] = (uint8_t)((accum >> bits) & 0xFF);
    }
  }
  return (int)outLen;
}

void finishDataBatch(uint32_t batchIndex, uint32_t fromFrame, uint16_t count) {
  uint32_t startSeq = batchIndex * BATCH_SIZE + fromFrame;
  float progress = totalFrames > 0 ? (framesSent * 100.0f) / totalFrames : 0.0f;
  uint32_t next = startSeq + count;
  sendBatchOk(batchIndex, next, progress);
  currentState = STATE_READY;
}

void handleDataBatch(uint32_t batchIndex, uint32_t fromFrame, JsonArray &framesArr) {
  if (currentState != STATE_READY && currentState != STATE_DATA) {
    sendError("Not ready for data");
    return;
  }
  currentState = STATE_DATA;

  size_t frameCount = framesArr.size();
  if (frameCount == 0 || frameCount > BATCH_SIZE) {
    sendError("Batch size must be 1-1024 frames");
    return;
  }
  uint16_t count = (uint16_t)frameCount;
  if (fromFrame + count > BATCH_SIZE) {
    sendError("from + frames exceeds batch size");
    return;
  }

  static uint8_t frames[BATCH_SIZE][DATA_PER_FRAME];
  for (uint16_t i = 0; i < count; i++) {
    JsonArray row = framesArr[i].as<JsonArray>();
    if (row.size() != DATA_PER_FRAME) {
      sendError("Each frame must have 4 bytes");
      return;
    }
    for (uint8_t j = 0; j < DATA_PER_FRAME; j++)
      frames[i][j] = row[j];
  }

  uint32_t startSeq = batchIndex * BATCH_SIZE + fromFrame;
  int failAt = sendBatchToCan(startSeq, frames, count);
  if (failAt >= 0) {
    sendRetry(batchIndex, fromFrame + (uint32_t)failAt);
    return;
  }

  finishDataBatch(batchIndex, fromFrame, count);
}

void handleDataBatchB64(uint32_t batchIndex, uint32_t fromFrame, const char *b64Str) {
  if (currentState != STATE_READY && currentState != STATE_DATA) {
    sendError("Not ready for data");
    return;
  }
  currentState = STATE_DATA;

  static uint8_t rawBuf[BATCH_SIZE * DATA_PER_FRAME];
  int decoded = b64Decode(b64Str, rawBuf, sizeof(rawBuf));
  if (decoded < 0 || decoded == 0) {
    sendError("Base64 decode error");
    return;
  }
  if (decoded % DATA_PER_FRAME != 0) {
    sendError("b64 length must be multiple of 4 bytes");
    return;
  }

  uint16_t count = (uint16_t)(decoded / DATA_PER_FRAME);
  if (count == 0 || count > BATCH_SIZE || fromFrame + count > BATCH_SIZE) {
    sendError("Invalid b64 batch size");
    return;
  }

  uint32_t startSeq = batchIndex * BATCH_SIZE + fromFrame;
  int failAt = sendBatchToCan(startSeq, (const uint8_t(*)[DATA_PER_FRAME])rawBuf, count);
  if (failAt >= 0) {
    sendRetry(batchIndex, fromFrame + (uint32_t)failAt);
    return;
  }

  finishDataBatch(batchIndex, fromFrame, count);
}

void handleVerify() {
  if (currentState != STATE_READY) {
    sendError("Not in ready state for verify");
    return;
  }
  if (totalFrames > 0 && framesSent != totalFrames) {
    sendError("Not all frames sent; cannot verify");
    return;
  }
  currentState = STATE_VERIFY;

  uint8_t vFrame[8] = {
    CMD_VERIFY, 0x00, 0xE2, 0x04,
    (uint8_t)(expectedCrc32 & 0xFF),
    (uint8_t)((expectedCrc32 >> 8) & 0xFF),
    (uint8_t)((expectedCrc32 >> 16) & 0xFF),
    (uint8_t)((expectedCrc32 >> 24) & 0xFF),
  };
  if (!canTx(ID_BUS, vFrame, 8)) {
    sendError("VERIFY TX failed");
    return;
  }

  uint8_t goFrame[8] = {CMD_GO, 0x00, 0xE2, 0x00, 0x00, 0x00, 0x00, 0x00};
  if (!canTx(ID_BUS, goFrame, 8)) {
    sendError("GO TX failed");
    return;
  }

  delay(500);
  sendComplete();
}

void handleAbort() {
  canStop();
  canInit();
  currentState = STATE_IDLE;
  framesSent = 0;
  totalFrames = 0;
  expectedCrc32 = 0;
  errorMsg = "";
  benchMode = false;
  pacingUs = 500;
  StaticJsonDocument<JSON_TX_DOC_SIZE> doc;
  doc["status"] = "aborted";
  sendJsonResponse(doc);
}

void processJsonCommand(const String &line) {
  if (line.length() >= CDC_RX_LINE_MAX) {
    sendError("Line too long for RX buffer — use b64");
    return;
  }

  bool isB64 = line.indexOf("\"b64\"") >= 0;
  size_t docSize = isB64 ? JSON_RX_DOC_B64 : JSON_RX_DOC_SMALL;

  DynamicJsonDocument doc(docSize);
  DeserializationError err = deserializeJson(doc, line);
  if (err) {
    if (err == DeserializationError::NoMemory) sendError("JSON parse error: NoMemory");
    else sendError("JSON parse error");
    return;
  }

  const char *cmd = doc["cmd"];
  if (!cmd) {
    sendError("Missing cmd field");
    return;
  }

  if (strcmp(cmd, "start") == 0) {
    if (!doc.containsKey("crc32") || !doc.containsKey("total")) {
      sendError("start requires crc32 and total");
      return;
    }
    uint32_t crc32 = doc["crc32"].as<uint32_t>();
    uint32_t total = doc["total"].as<uint32_t>();
    uint32_t pacing = doc.containsKey("pacing") ? doc["pacing"].as<uint32_t>() : 500;
    bool bench = doc.containsKey("bench") ? doc["bench"].as<bool>() : false;
    handleStart(crc32, total, pacing, bench);
  } else if (strcmp(cmd, "data") == 0) {
    if (!doc.containsKey("batch")) {
      sendError("data requires batch");
      return;
    }
    uint32_t batch = doc["batch"].as<uint32_t>();
    uint32_t fromFrame = doc["from"] | 0;

    if (doc.containsKey("b64")) {
      const char *b64 = doc["b64"].as<const char *>();
      if (!b64) {
        sendError("b64 must be a string");
        return;
      }
      handleDataBatchB64(batch, fromFrame, b64);
    } else if (doc.containsKey("frames")) {
      if (line.length() > 16384) {
        sendError("JSON frames line too long — use b64");
        return;
      }
      JsonArray framesArr = doc["frames"].as<JsonArray>();
      handleDataBatch(batch, fromFrame, framesArr);
    } else {
      sendError("data requires b64 or frames");
    }
  } else if (strcmp(cmd, "verify") == 0) {
    handleVerify();
  } else if (strcmp(cmd, "status") == 0) {
    sendStatus();
  } else if (strcmp(cmd, "abort") == 0) {
    handleAbort();
  } else {
    sendError("Unknown command");
  }
}

void setup() {
  Serial.setRxBufferSize(CDC_RX_LINE_MAX);
  Serial.begin(UART_BAUD);
  uint32_t t = millis();
  while (!Serial && millis() - t < 3000)
    delay(10);
  delay(500);

  if (!canInit()) {
    Serial.println("{\"status\":\"error\",\"msg\":\"CAN init failed\"}");
    while (1) delay(1000);
  }

  Serial.println("{\"status\":\"boot\",\"version\":\"2.8-b64\",\"can\":\"500kbps\"}");
  Serial.flush();
}

void loop() {
  static char rxBuffer[CDC_RX_LINE_MAX];
  static size_t rxIndex = 0;

  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      rxBuffer[rxIndex] = '\0';
      String line(rxBuffer);
      line.trim();
      if (line.length() > 0) {
        processJsonCommand(line);
      }
      rxIndex = 0;
    } else if (c != '\r') {
      if (rxIndex < sizeof(rxBuffer) - 1) {
        rxBuffer[rxIndex++] = c;
      } else {
        rxIndex = 0;
        sendError("Serial RX buffer overflow");
      }
    }
  }
  delay(1);
}
