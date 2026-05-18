// ═══════════════════════════════════════════════════════════════════════════
// ESP32 BMS Flash Bridge — REQUIRED FIXES (apply to your .ino sketch)
// Matches decoder.tsx + Python flash_bms() CAN format: [A1 seq E2 04 d0 d1 d2 d3]
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. setup() — BEFORE Serial.begin() ───────────────────────────────────
void setup() {
  Serial.setRxBufferSize(4096);  // required for 64-frame JSON; safe for 8-frame lines too
  Serial.begin(UART_BAUD);
  // ... rest unchanged
}

// ── 2. sendBatchToCan() — REPLACE the canFrame[] build ───────────────────
// WRONG:  A1  seq_lo  (seq>>8)  04  d0 d1 d2 d3  →  a1 00 00 04 ...
// RIGHT:  A1  seq_lo  E2        04  d0 d1 d2 d3  →  a1 00 e2 04 d0 f9 00 20

int sendBatchToCan(uint32_t startSeq, const uint8_t frames[][DATA_PER_FRAME],
                   uint8_t count) {
  for (uint8_t i = 0; i < count; i++) {
    uint32_t seq = startSeq + i;

    uint8_t canFrame[8] = {
        CMD_DATA,
        (uint8_t)(seq & 0xFF),
        0xE2,  // fixed bus byte — NOT (uint8_t)((seq >> 8) & 0xFF)
        0x04,
        frames[i][0],
        frames[i][1],
        frames[i][2],
        frames[i][3],
    };

    if (!canTx(ID_BUS, canFrame, 8))
      return (int)i;

    uint8_t ack[] = {ACK_OK};
    if (!canRx(ID_BUS, ack, 1, ACK_TIMEOUT_MS))
      return (int)i;

    framesSent++;
  }
  return -1;
}

// ── 3. handleDataBatch — ADD fromFrame parameter ─────────────────────────
void handleDataBatch(uint32_t batchIndex, uint32_t fromFrame, JsonArray &framesArr) {
  if (currentState != STATE_READY && currentState != STATE_DATA) {
    sendError("Not ready for data — run start first");
    return;
  }
  currentState = STATE_DATA;

  uint8_t count = (uint8_t)framesArr.size();
  if (count == 0 || count > BATCH_SIZE) {
    sendError("Batch size must be 1–64 frames");
    return;
  }
  if (fromFrame + count > BATCH_SIZE) {
    sendError("from + frames exceeds batch size");
    return;
  }

  uint8_t frames[BATCH_SIZE][DATA_PER_FRAME];
  for (uint8_t i = 0; i < count; i++) {
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

  float progress = totalFrames > 0 ? (framesSent * 100.0f) / totalFrames : 0.0f;
  uint32_t next = startSeq + count;
  sendBatchOk(batchIndex, next, progress);
  currentState = STATE_READY;
}

// ── 4. processJsonCommand — parse "from" on data command ─────────────────
} else if (strcmp(cmd, "data") == 0) {
  if (!doc.containsKey("batch") || !doc.containsKey("frames")) {
    sendError("data requires batch and frames");
    return;
  }
  uint32_t fromFrame = doc["from"] | 0;
  JsonArray framesArr = doc["frames"].as<JsonArray>();
  handleDataBatch(doc["batch"].as<uint32_t>(), fromFrame, framesArr);
}

// ── 5. After every handleDataBatch you MUST reach sendBatchOk/sendError ───
//    (do not hang in CAN without replying on Serial)

// ── 6. Optional: set OTA_FULL_BATCH_MODE = true in decoder.tsx after flashing
//    App will send 64 frames in one JSON line (~847 B) instead of 8 per line.
