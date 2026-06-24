/*
 * ESP32 BMS Flash Bridge
 *
 * Architecture:
 *   Android App ──UART/JSON──► ESP32 ──TWAI/CAN──► BMS
 *
 * Flow:
 *   1. Android sends {"cmd":"start","crc32":...,"total":32768}
 *   2. ESP32 autonomously runs: ping → sync → announce → unlock
 *   3. ESP32 responds {"status":"ready"} when unlocked
 *   4. Android streams batches:
 * {"cmd":"data","batch":0,"frames":[[...],[...],...]}
 *   5. ESP32 builds CAN frames, sends each, waits for BMS ACK [50]
 *   6. ESP32 responds {"status":"ok","batch":N,"next":M,"progress":P}
 *      or {"status":"retry","batch":N,"from":F} on partial failure
 *   7. Android sends {"cmd":"verify"} after all batches
 *   8. ESP32 sends VERIFY + GO to BMS, responds {"status":"complete"}
 *
 * JSON Commands from Android:
 *   {"cmd":"start","crc32":3462551478,"total":32768}
 *   {"cmd":"data","batch":0,"b64":"AQIDBAQFB..."}          // base64
 * (preferred)
 *   {"cmd":"data","batch":0,"frames":[[d0,d1,d2,d3],...]}   // JSON array
 * (legacy)
 *   {"cmd":"verify"}
 *   {"cmd":"status"}
 *   {"cmd":"abort"}
 *
 * JSON Responses to Android:
 *   {"status":"ready","msg":"unlocked"}
 *   {"status":"ok","batch":0,"next":64,"progress":0.2}
 *   {"status":"retry","batch":0,"from":23}
 *   {"status":"error","msg":"..."}
 *   {"status":"complete"}
 */

 #include <Arduino.h>
 #include <ArduinoJson.h>
 #include <ESP32-TWAI-CAN.hpp>
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Configuration
 // ══════════════════════════════════════════════════════════════════════════════
 
 // UART
 #define UART_BAUD 115200
 
 // JSON doc sizes
 // With b64 format, only ~8 KB needed. Legacy JSON array format needs ~96 KB
 // per 1024 frames. We size for the b64 path; legacy will use a fallback.
 #define JSON_RX_DOC_SIZE 8192 // 8 KB — sufficient for b64 data commands
 #define JSON_TX_DOC_SIZE 256  // outgoing responses
 
 // TWAI/CAN pins (adjust for your board)
 #define CAN_TX_PIN GPIO_NUM_23
 #define CAN_RX_PIN GPIO_NUM_22
 #define CAN_BITRATE_KBPS 500
 
 // CAN IDs
 #define ID_PING 0x069
 #define ID_BUS 0x00B
 #define ID_INFO 0x456
 
 // Bootloader commands
 #define CMD_UNLOCK 0xA0
 #define CMD_DATA 0xA1
 #define CMD_VERIFY 0xA2
 #define CMD_GO 0xA3
 
 // ACKs
 #define ACK_OK 0x50
 #define ACK_CRC_OK 0x53
 
 // Timeouts (ms)
 #define ACK_TIMEOUT_MS 2000
 #define INFO_TIMEOUT_MS 5000
 #define ANNOUNCE_TIMEOUT_MS 5000
 #define CRC_TIMEOUT_MS 10000
 
 // Flash constants
 #define BATCH_SIZE 1024  // frames per batch from Android
 #define DATA_PER_FRAME 4 // bytes per CAN data frame
 
 // CAN logger constants
 //   170 frames/sec broadcast → 3060 bytes/sec raw → 4080 base64 chars/sec
 //   Buffer 256 frames (1.5× a full broadcast burst) to avoid any drops.
 #define CSVLOG_RECORD_SIZE 18 // bytes per binary CAN record
 #define CSVLOG_MAX_FRAMES 256 // frames to buffer (handles 170 fps burst)
 #define CSVLOG_FLUSH_MS 100   // flush every 100 ms (~17 frames/packet)
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Global State
 // ══════════════════════════════════════════════════════════════════════════════
 
 enum State {
   STATE_IDLE,
   STATE_HANDSHAKE, // running ping/sync/announce/unlock
   STATE_READY,     // unlocked, waiting for data batches
   STATE_DATA,      // receiving and forwarding data batches
   STATE_VERIFY,    // verifying CRC
   STATE_COMPLETE,
   STATE_ERROR
 };
 
 State currentState = STATE_IDLE;
 uint32_t totalFrames = 0;
 uint32_t framesSent = 0;
 uint32_t expectedCrc32 = 0;
 String errorMsg = "";
 uint32_t pacingUs =
     500; // pacing delay in microseconds between CAN frames (default 500us)
 bool benchMode = false; // true to bypass CAN hardware failures and fake success
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Diagnosis & Telemetry Live Data
 // ══════════════════════════════════════════════════════════════════════════════
 bool diagnosisMode = false;
 uint32_t lastDiagnosisPrintMs = 0;
 uint32_t lastMotorRequestMs = 0;
 
 // ══════════════════════════════════════════════════════════════════════════════
 // CAN Logger State
 // ══════════════════════════════════════════════════════════════════════════════
 bool csvLogMode = false;
 static uint8_t csvLogBuf[CSVLOG_MAX_FRAMES * CSVLOG_RECORD_SIZE];
 static uint16_t csvLogBufLen = 0;
 static uint32_t csvLogFlushMs = 0;
 
 float soc = 0.0f;
 float pack_voltage = 0.0f;
 float pack_current = 0.0f;
 float pack_temp = 0.0f;
 float cell_v[3] = {0.0f, 0.0f, 0.0f};
 float cell_t[3] = {0.0f, 0.0f, 0.0f};
 uint32_t cycle = 0;
 uint32_t rpm = 0;
 float motor_temp = 0.0f;
 float dcdc_v = 0.0f;
 float dcdc_i = 0.0f;
 
 // Additional parsed values
 bool fault_uv = false;
 bool fault_ov = false;
 bool fault_otc = false;
 bool fault_utc = false;
 bool fault_ocd1 = false;
 bool fault_ocd2 = false;
 bool fault_sc = false;
 bool fault_iso = false;
 
 uint32_t total_cells = 0;
 float min_v = 0.0f;
 float max_v = 0.0f;
 uint32_t min_cell_id = 0;
 uint32_t max_cell_id = 0;
 
 float bat_plus_v = 0.0f;
 float fc_v = 0.0f;
 float sc_v = 0.0f;
 float pchg_v = 0.0f;
 float dsg_v = 0.0f;
 
 bool relay_dsg = false;
 bool relay_pchg = false;
 bool relay_fc = true;
 bool relay_sc = false;
 bool relay_dcdc = true;
 bool relay_out = true;
 bool relay_neg_enb = true;
 bool relay_pos_enb = true;
 
 float dcdc_voltage_v = 0.0f;
 float dcdc_current_a = 0.0f;
 int16_t dcdc_temp_c = 0;
 bool dcdc_ready = true;
 bool dcdc_working = true;
 bool dcdc_hvil_err = false;
 bool dcdc_over_temp = false;
 
 // DCDC2 Status (0x18F8622B)
 float dcdc2_voltage_v = 0.0f;
 float dcdc2_current_a = 0.0f;
 int16_t dcdc2_temp_c = 0;
 uint8_t dcdc2_work_val = 0;
 uint8_t dcdc2_fault_val = 0;
 uint8_t dcdc2_sys_val = 0;
 uint8_t dcdc2_err_flags = 0;
 uint8_t dcdc2_ver = 0;
 
 // DCDC2 Command (0x10262B27)
 uint8_t dcdc2_cmd_mode = 0;
 float dcdc2_cmd_vset = 0.0f;
 float dcdc2_cmd_iset = 0.0f;
 uint8_t dcdc2_cmd_reset = 0;
 
 const char *charger_status = "Idle";
 float charger_voltage = 0.0f;
 float charger_current = 0.0f;
 uint8_t charger_err = 0;
 
 uint32_t motor_runtime = 0;
 
 const char *evcc_last_msg_code = "";
 char evcc_last_can_id[24] = "";
 const char *evcc_description = "";
 
 struct EvccMsg {
   uint32_t id;
   const char *code;
   const char *desc;
 };
 
 static const EvccMsg EVCC_MSGS[] = {
     {0x1826F456, "CHM", "Charger handshake"},
     {0x182756F4, "BHM", "Vehicle handshake"},
     {0x1801F456, "CRM", "Charger recognition"},
     {0x1C0256F4, "BRM", "BMS and vehicle identification"},
     {0x1C0656F4, "BCP", "Battery charging parameters"},
     {0x1807F456, "CTS", "Charger time sync"},
     {0x1808F456, "CML", "Charger max output capability"},
     {0x100956F4, "BRO", "Battery charging ready state"},
     {0x100AF456, "CRO", "Charger output ready state"},
     {0x181056F4, "BCL", "Battery charging demand"},
     {0x1C1156F4, "BCS", "Overall battery charging status"},
     {0x1812F456, "CCS", "Charger charging status"},
     {0x181356F4, "BSM", "Power storage battery status"},
     {0x101956F4, "BST", "BMS suspending charge"},
     {0x101AF456, "CST", "Charger suspending charge"},
     {0x181C56F4, "BSD", "BMS statistical data"},
     {0x181DF456, "CSD", "Charger statistical data"},
     {0x181E56F4, "BEM", "BMS error message"},
     {0x181FF456, "CEM", "Charger error message"},
     {0x1C1556F4, "BMV", "Single battery voltage"},
     {0x1C1656F4, "BMT", "Battery temperature"},
     {0x1C1756F4, "BSP", "Reserved battery message"}};
 static const size_t EVCC_MSGS_LEN = sizeof(EVCC_MSGS) / sizeof(EVCC_MSGS[0]);
 
 // ══════════════════════════════════════════════════════════════════════════════
 // TWAI/CAN  (via ESP32-TWAI-CAN library)
 // ══════════════════════════════════════════════════════════════════════════════
 
 bool canInit() {
   // begin(speed_kbps, tx_pin, rx_pin, tx_queue, rx_queue)
   return ESP32Can.begin(ESP32Can.convertSpeed(CAN_BITRATE_KBPS), CAN_TX_PIN,
                         CAN_RX_PIN, 10, 10);
 }
 
 void canStop() { ESP32Can.end(); }
 
 // Reset the CAN controller after bus-off or persistent TX errors.
 void canRecover() {
   ESP32Can.end();
   delay(100);
   ESP32Can.begin(ESP32Can.convertSpeed(CAN_BITRATE_KBPS), CAN_TX_PIN,
                  CAN_RX_PIN, 10, 10);
 }
 
 // Drain the RX queue so stale frames don't confuse subsequent canRx() calls.
 void canFlushRx() {
   CanFrame tmp;
   while (ESP32Can.readFrame(tmp, 0)) {
   }
 }
 
 bool canTx(uint32_t id, const uint8_t *data, uint8_t len) {
   if (benchMode) {
     delayMicroseconds(300); // simulate CAN transmission time
     return true;
   }
 
   CanFrame frame = {0};
   frame.identifier = id;
   frame.extd = 0; // standard 11-bit ID
   frame.rtr = 0;  // data frame
   frame.data_length_code = len;
   memcpy(frame.data, data, len);
 
   // Reduce write timeout to 5ms (plenty of time at 500kbps)
   if (!ESP32Can.writeFrame(frame, 5)) {
     // Only recover if TWAI controller has actually gone bus-off (state 2)
     if (ESP32Can.canState() == 2) {
       canRecover();
     }
     return false;
   }
   return true;
 }
 
 // Returns true if a matching frame is received within timeoutMs.
 // Pass expectedData=NULL to accept any data from that ID.
 bool canRx(uint32_t expectedId, const uint8_t *expectedData,
            uint8_t expectedLen, uint32_t timeoutMs) {
   if (benchMode) {
     delay(5); // simulate small response delay
     return true;
   }
 
   uint32_t start = millis();
   CanFrame frame;
 
   // Tight polling for the first 500 microseconds before yielding
   uint32_t pollStart = micros();
   while (micros() - pollStart < 500) {
     if (ESP32Can.readFrame(frame, 0)) {
       if (frame.identifier == expectedId) {
         if (expectedData == NULL)
           return true;
         if (frame.data_length_code >= expectedLen) {
           bool match = true;
           for (uint8_t i = 0; i < expectedLen; i++) {
             if (frame.data[i] != expectedData[i]) {
               match = false;
               break;
             }
           }
           if (match)
             return true;
         }
       }
     }
   }
 
   while (millis() - start < timeoutMs) {
     // readFrame polls with a short internal wait; remaining time passed as hint
     uint32_t remaining = timeoutMs - (millis() - start);
     if (remaining == 0)
       break;
     uint32_t pollMs = remaining < 50 ? remaining : 50;
     if (ESP32Can.readFrame(frame, pollMs)) {
       if (frame.identifier == expectedId) {
         if (expectedData == NULL)
           return true;
         if (frame.data_length_code >= expectedLen) {
           bool match = true;
           for (uint8_t i = 0; i < expectedLen; i++) {
             if (frame.data[i] != expectedData[i]) {
               match = false;
               break;
             }
           }
           if (match)
             return true;
         }r
       }
     }
     delay(1); // yields to idle task, properly feeds the WDT
   }
   return false;
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // JSON Response Helpers
 // ══════════════════════════════════════════════════════════════════════════════
 
 template <typename T> void sendJsonResponse(T &doc) {
   char txBuf[JSON_TX_DOC_SIZE];
   size_t len = serializeJson(doc, txBuf, sizeof(txBuf));
   if (len < sizeof(txBuf) - 1) {
     txBuf[len++] = '\n';
     Serial.write((const uint8_t *)txBuf, len);
   } else {
     // Fallback if somehow it overflows
     serializeJson(doc, Serial);
     Serial.println();
   }
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
   doc["progress"] = roundf(progress * 10.0f) / 10.0f; // real float, 1 decimal
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
   if (currentState == STATE_ERROR)
     doc["error"] = errorMsg;
   sendJsonResponse(doc);
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Handshake: two-phase bootloader protocol
 //
 // Phase 1 — matches working Python script (steps 1-5):
 //   TX 0x069: 69                            (PING,    delay 20 ms)
 //   TX 0x00B: 69 96 69 96 69 96 69 96       (SYNC,    delay 50 ms)
 //   TX 0x00B: B1                            (ANNOUNCE)
 //   RX 0x00B: B1                            (BMS echo)
 //   RX 0x456: 11 ...                        (device info — BMS in bootloader)
 //   TX 0x00B: A0 00 E2 04 00 00 02 00       (UNLOCK)
 //   RX 0x00B: 50                            (ACK)
 //
 // Phase 2 (connect + load):
 //   TX 0x069: 69                            (PING again)
 //   TX 0x00B: B1                            (ANNOUNCE)
 //   RX 0x00B: B1                            (BMS echo)
 //   TX 0x00B: A0 00 E2 04 00 00 02 00       (UNLOCK)
 //   RX 0x00B: 50                            (ACK)
 //   [data frames] TX 0x00B: A1 seq E2 04 d0 d1 d2 d3
 //                RX 0x00B: 50               (per-frame ACK)
 //   TX 0x00B: A2 00 E2 04 crc0..3           (VERIFY with real CRC)
 //   TX 0x00B: A3 00 E2 00 00 00 00 00       (GO / restart)
 // ══════════════════════════════════════════════════════════════════════════════
 
 // Phase-1: mirrors working Python script steps 1-5.
 bool doHandshakePhase1() {
   // Step 1: PING (0x069: 69) — fire and forget, 20 ms gap
   {
     uint8_t d[] = {0x69};
     bool ok = false;
     for (uint8_t i = 0; i < 3 && !ok; i++) {
       if (i > 0)
         delay(300);
       ok = canTx(ID_PING, d, 1);
     }
     if (!ok) {
       sendError("PING TX failed");
       return false;
     }
     delay(20);
   }
 
   // Step 2: SYNC (0x00B: 69 96 69 96 69 96 69 96) — fire and forget, 50 ms gap
   {
     uint8_t d[] = {0x69, 0x96, 0x69, 0x96, 0x69, 0x96, 0x69, 0x96};
     if (!canTx(ID_BUS, d, 8)) {
       sendError("SYNC TX failed");
       return false;
     }
     delay(50);
   }
 
   // Step 3: ANNOUNCE (0x00B: B1) → wait BMS echo [B1]
   {
     canFlushRx();
     uint8_t d[] = {0xB1};
     if (!canTx(ID_BUS, d, 1)) {
       sendError("ANNOUNCE TX failed");
       return false;
     }
     uint8_t echoExp[] = {0xB1};
     if (!canRx(ID_BUS, echoExp, 1, ANNOUNCE_TIMEOUT_MS)) {
       sendError("No BMS echo [B1]");
       return false;
     }
   }
 
   // Step 4: Wait device info (0x456: first byte 0x11)
   // BMS broadcasts this continuously once it enters bootloader mode.
   {
     uint8_t infoExp[] = {0x11};
     if (!canRx(ID_INFO, infoExp, 1, INFO_TIMEOUT_MS)) {
       sendError("No device info from 0x456");
       return false;
     }
   }
 
   // Step 5: UNLOCK (0x00B: A0 00 E2 04 00 00 02 00) → wait ACK [50]
   {
     uint8_t d[] = {CMD_UNLOCK, 0x00, 0xE2, 0x04, 0x00, 0x00, 0x02, 0x00};
     if (!canTx(ID_BUS, d, 8)) {
       sendError("UNLOCK TX failed");
       return false;
     }
     uint8_t ack[] = {ACK_OK};
     if (!canRx(ID_BUS, ack, 1, ACK_TIMEOUT_MS)) {
       sendError("No UNLOCK ACK [50]");
       return false;
     }
   }
 
   // Drain any leftover beacon frames so Phase-2 RX starts clean.
   canFlushRx();
 
   return true;
 }
 
 // Phase-2: PING + ANNOUNCE(B1) + UNLOCK(A0) — prepares BMS to receive data.
 bool doHandshakePhase2() {
   // --- PING (0x069: 69) ---
   {
     uint8_t d[] = {0x69};
     bool ok = false;
     for (uint8_t i = 0; i < 3 && !ok; i++) {
       if (i > 0)
         delay(300);
       ok = canTx(ID_PING, d, 1);
     }
     if (!ok) {
       sendError("PING(p2) TX failed");
       return false;
     }
   }
 
   // --- ANNOUNCE (0x00B: B1) — wait for BMS echo B1 ---
   {
     uint8_t d[] = {0xB1};
     if (!canTx(ID_BUS, d, 1)) {
       sendError("ANNOUNCE(p2) TX failed");
       return false;
     }
     uint8_t echoExp[] = {0xB1};
     if (!canRx(ID_BUS, echoExp, 1, ANNOUNCE_TIMEOUT_MS)) {
       sendError("No BMS echo(p2) [B1]");
       return false;
     }
   }
 
   // --- UNLOCK (0x00B: A0 00 E2 04 00 00 02 00) — wait ACK 50 ---
   {
     uint8_t d[] = {CMD_UNLOCK, 0x00, 0xE2, 0x04, 0x00, 0x00, 0x02, 0x00};
     if (!canTx(ID_BUS, d, 8)) {
       sendError("UNLOCK(p2) TX failed");
       return false;
     }
     uint8_t ack[] = {ACK_OK};
     if (!canRx(ID_BUS, ack, 1, ACK_TIMEOUT_MS)) {
       sendError("No UNLOCK(p2) ACK [50]");
       return false;
     }
   }
 
   return true;
 }
 
 bool doHandshake() {
   if (!doHandshakePhase1())
     return false;
   if (!doHandshakePhase2())
     return false;
   return true;
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Data Batch Handler
 // ══════════════════════════════════════════════════════════════════════════════
 
 // Sends one batch of frames to CAN.
 // Each frame waits for ACK [50] from the BMS before sending the next.
 // Returns index of first failed frame, or -1 on full success.
 int sendBatchToCan(uint32_t startSeq, const uint8_t frames[][DATA_PER_FRAME],
                    uint16_t count) {
   for (uint16_t i = 0; i < count; i++) {
     uint32_t seq = startSeq + i;
 
     // Build CAN frame: [A1 seq E2 04 d0 d1 d2 d3]
     uint8_t canFrame[8] = {CMD_DATA,     (uint8_t)(seq & 0xFF), 0xE2,
                            0x04,         frames[i][0],          frames[i][1],
                            frames[i][2], frames[i][3]};
 
     if (!canTx(ID_BUS, canFrame, 8))
       return (int)i;
 
     // Wait for per-frame ACK [50] from BMS
     uint8_t ack[] = {ACK_OK};
     if (!canRx(ID_BUS, ack, 1, ACK_TIMEOUT_MS))
       return (int)i;
 
     // Optional pacing delay (can be zero when ACK already paces the flow)
     if (!benchMode && pacingUs > 0) {
       delayMicroseconds(pacingUs);
     }
 
     if (seq + 1 > framesSent) {
       framesSent = seq + 1;
     }
   }
   return -1; // all good
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Command Handlers
 // ══════════════════════════════════════════════════════════════════════════════
 
 void handleStart(uint32_t crc32, uint32_t total, uint32_t pacing, bool bench) {
   expectedCrc32 = crc32;
   totalFrames = total;
   pacingUs = pacing;
   benchMode = bench;
   framesSent = 0;
   currentState = STATE_HANDSHAKE;
 
   if (!doHandshake())
     return; // sendError already called inside
 
   currentState = STATE_READY;
   sendReady();
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Base64 Decoder (in-place, no external library needed)
 // ══════════════════════════════════════════════════════════════════════════════
 
 static const int8_t b64Lut[128] = {
     -1, -1, -1, -1, -1, -1, -1, -1,
     -1, -1, -1, -1, -1, -1, -1, -1, // 0-15
     -1, -1, -1, -1, -1, -1, -1, -1,
     -1, -1, -1, -1, -1, -1, -1, -1, // 16-31
     -1, -1, -1, -1, -1, -1, -1, -1,
     -1, -1, -1, 62, -1, -1, -1, 63, // 32-47  (+, /)
     52, 53, 54, 55, 56, 57, 58, 59,
     60, 61, -1, -1, -1, -1, -1, -1, // 48-63  (0-9)
     -1, 0,  1,  2,  3,  4,  5,  6,
     7,  8,  9,  10, 11, 12, 13, 14, // 64-79  (A-O)
     15, 16, 17, 18, 19, 20, 21, 22,
     23, 24, 25, -1, -1, -1, -1, -1, // 80-95  (P-Z)
     -1, 26, 27, 28, 29, 30, 31, 32,
     33, 34, 35, 36, 37, 38, 39, 40, // 96-111 (a-o)
     41, 42, 43, 44, 45, 46, 47, 48,
     49, 50, 51, -1, -1, -1, -1, -1 // 112-127(p-z)
 };
 
 // Decode base64 string into output buffer. Returns number of decoded bytes,
 // or -1 on error. Output buffer must be at least (strlen(input)*3/4) bytes.
 int b64Decode(const char *input, uint8_t *output, size_t maxOut) {
   size_t len = strlen(input);
   // Strip trailing '=' padding
   while (len > 0 && input[len - 1] == '=')
     len--;
 
   size_t outLen = 0;
   uint32_t accum = 0;
   uint8_t bits = 0;
 
   for (size_t i = 0; i < len; i++) {
     uint8_t c = (uint8_t)input[i];
     if (c >= 128)
       return -1;
     int8_t val = b64Lut[c];
     if (val < 0)
       return -1;
 
     accum = (accum << 6) | (uint32_t)val;
     bits += 6;
     if (bits >= 8) {
       bits -= 8;
       if (outLen >= maxOut)
         return -1;
       output[outLen++] = (uint8_t)(accum >> bits) & 0xFF;
     }
   }
   return (int)outLen;
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Base64 Encoder  (for CAN logger outbound data)
 // ══════════════════════════════════════════════════════════════════════════════
 
 static const char b64Chars[] =
     "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
 
 // Encode binary input into base64 string (null-terminated).
 // output buffer must be at least ceil(inputLen*4/3)+1 bytes.
 size_t b64Encode(const uint8_t *input, size_t inputLen, char *output,
                  size_t maxOut) {
   size_t outLen = 0;
   for (size_t i = 0; i < inputLen; i += 3) {
     if (outLen + 4 >= maxOut)
       break; // safety guard
     uint32_t b = (uint32_t)input[i] << 16;
     if (i + 1 < inputLen)
       b |= (uint32_t)input[i + 1] << 8;
     if (i + 2 < inputLen)
       b |= (uint32_t)input[i + 2];
     output[outLen++] = b64Chars[(b >> 18) & 0x3F];
     output[outLen++] = b64Chars[(b >> 12) & 0x3F];
     output[outLen++] = (i + 1 < inputLen) ? b64Chars[(b >> 6) & 0x3F] : '=';
     output[outLen++] = (i + 2 < inputLen) ? b64Chars[b & 0x3F] : '=';
   }
   output[outLen] = '\0';
   return outLen;
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // CAN Logger Helpers
 // ══════════════════════════════════════════════════════════════════════════════
 
 // Append one CAN frame to the logger buffer as an 18-byte binary record.
 void csvLogAddFrame(const CanFrame &frame) {
   if (csvLogBufLen + CSVLOG_RECORD_SIZE > sizeof(csvLogBuf))
     return; // buffer full, drop (flush should have emptied it)
 
   uint32_t ts = millis();
   uint8_t *p = csvLogBuf + csvLogBufLen;
 
   // [0..3]  timestamp ms  (little-endian)
   p[0] = (uint8_t)(ts & 0xFF);
   p[1] = (uint8_t)((ts >> 8) & 0xFF);
   p[2] = (uint8_t)((ts >> 16) & 0xFF);
   p[3] = (uint8_t)((ts >> 24) & 0xFF);
   // [4..7]  CAN ID         (little-endian)
   p[4] = (uint8_t)(frame.identifier & 0xFF);
   p[5] = (uint8_t)((frame.identifier >> 8) & 0xFF);
   p[6] = (uint8_t)((frame.identifier >> 16) & 0xFF);
   p[7] = (uint8_t)((frame.identifier >> 24) & 0xFF);
   // [8]     flags: bit0=extd, bit1=rtr
   p[8] = (frame.extd ? 0x01 : 0x00) | (frame.rtr ? 0x02 : 0x00);
   // [9]     DLC
   p[9] = frame.data_length_code;
   // [10..17] data (zero-padded to 8 bytes)
   memset(p + 10, 0, 8);
   memcpy(p + 10, frame.data,
          frame.data_length_code < 8 ? frame.data_length_code : 8);
 
   csvLogBufLen += CSVLOG_RECORD_SIZE;
 }
 
 // Encode buffered frames as base64 and send {"log":"<b64>"} over serial.
 void csvLogFlush() {
   if (csvLogBufLen == 0)
     return;
 
   // Max base64 output: ceil(256*18*4/3) = 6144 chars + null + padding
   static char b64Buf[6152];
   size_t b64Len = b64Encode(csvLogBuf, csvLogBufLen, b64Buf, sizeof(b64Buf));
 
   Serial.print("{\"log\":\"");
   Serial.print(b64Buf);
   Serial.println("\"}");
 
   csvLogBufLen = 0;
 }
 
 // ── Legacy JSON array handler ───────────────────────────────────────────────
 void handleDataBatch(uint32_t batchIndex, JsonArray &framesArr) {
   if (currentState != STATE_READY && currentState != STATE_DATA) {
     sendError("Not ready for data");
     return;
   }
   currentState = STATE_DATA;
 
   uint16_t count = (uint16_t)framesArr.size();
   if (count == 0 || count > BATCH_SIZE) {
     sendError("Batch size must be 1-1024 frames");
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
 
   uint32_t startSeq = batchIndex * BATCH_SIZE;
   int failAt = sendBatchToCan(startSeq, frames, count);
 
   if (failAt >= 0) {
     sendRetry(batchIndex, (uint32_t)failAt);
     return;
   }
 
   float progress = totalFrames > 0 ? (framesSent * 100.0f) / totalFrames : 0.0f;
   uint32_t next = startSeq + count;
   sendBatchOk(batchIndex, next, progress);
   currentState = STATE_READY;
 }
 
 // ── Base64 data handler (preferred — 24× less memory) ───────────────────────
 void handleDataBatchB64(uint32_t batchIndex, const char *b64Str) {
   if (currentState != STATE_READY && currentState != STATE_DATA) {
     sendError("Not ready for data");
     return;
   }
   currentState = STATE_DATA;
 
   // Decode base64 directly into static frames buffer
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
   if (count > BATCH_SIZE) {
     sendError("Batch size must be 1-1024 frames");
     return;
   }
 
   // Reinterpret raw buffer as 2D array for sendBatchToCan
   uint32_t startSeq = batchIndex * BATCH_SIZE;
   int failAt = sendBatchToCan(startSeq,
                               (const uint8_t (*)[DATA_PER_FRAME])rawBuf, count);
 
   if (failAt >= 0) {
     sendRetry(batchIndex, (uint32_t)failAt);
     return;
   }
 
   float progress = totalFrames > 0 ? (framesSent * 100.0f) / totalFrames : 0.0f;
   uint32_t next = startSeq + count;
   sendBatchOk(batchIndex, next, progress);
   currentState = STATE_READY;
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
 
   // VERIFY frame: [A2 00 E2 04 crc0 crc1 crc2 crc3] little-endian CRC
   uint8_t vFrame[8] = {CMD_VERIFY,
                        0x00,
                        0xE2,
                        0x04,
                        (uint8_t)(expectedCrc32 & 0xFF),
                        (uint8_t)((expectedCrc32 >> 8) & 0xFF),
                        (uint8_t)((expectedCrc32 >> 16) & 0xFF),
                        (uint8_t)((expectedCrc32 >> 24) & 0xFF)};
   if (!canTx(ID_BUS, vFrame, 8)) {
     sendError("VERIFY TX failed");
     return;
   }
 
   // Wait for ACK [53] — BMS confirms CRC matched before we send GO
   {
     uint8_t ack[] = {ACK_CRC_OK};
     if (!canRx(ID_BUS, ack, 1, CRC_TIMEOUT_MS)) {
       sendError("No VERIFY ACK [53]");
       return;
     }
   }
 
   // GO / restart frame: [A3 00 E2 00 00 00 00 00]
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
   csvLogMode = false;
   diagnosisMode = false;
   framesSent = 0;
   totalFrames = 0;
   expectedCrc32 = 0;
   csvLogBufLen = 0;
   errorMsg = "";
   StaticJsonDocument<JSON_TX_DOC_SIZE> doc;
   doc["status"] = "aborted";
   sendJsonResponse(doc);
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Diagnosis Telemetry Functions
 // ══════════════════════════════════════════════════════════════════════════════
 
 void updateEvccInfo(uint32_t id) {
   for (size_t i = 0; i < EVCC_MSGS_LEN; i++) {
     if (EVCC_MSGS[i].id == id) {
       evcc_last_msg_code = EVCC_MSGS[i].code;
       evcc_description = EVCC_MSGS[i].desc;
       snprintf(evcc_last_can_id, sizeof(evcc_last_can_id), "0x%08X", id);
       break;
     }
   }
 }
 
void parseDiagnosisCanFrame(const CanFrame &frame) {
  uint32_t id = frame.identifier;
  bool isExt = frame.extd;
  uint8_t dlc = frame.data_length_code;
  const uint8_t *d = frame.data;
  uint32_t std_id = id & 0x7FF;

  if (std_id == 0x581 && dlc >= 4) {
    uint8_t rsp = d[0];
    if (rsp == 0x4B || rsp == 0x43 || rsp == 0x4F) {
      if (d[1] == 0x21 && d[2] == 0x20 && d[3] == 0x06) {
        if (dlc >= 6) {
          rpm = d[4] | (d[5] << 8);
        }
      } else if (d[1] == 0x23 && d[2] == 0x20 && d[3] == 0x1E) {
        if (dlc >= 6) {
          int16_t temp_raw = (int16_t)(d[4] | (d[5] << 8));
          motor_temp = (float)temp_raw / 10.0f;
        }
      } else if (d[1] == 0x21 && d[2] == 0x20 && d[3] == 0x19) {
        if (dlc >= 6) {
          motor_runtime = d[4] | (d[5] << 8);
        }
      }
    }
    return;
  }

  if (isExt) {
     if (id == 0x18A10002) {
       if (dlc >= 2) {
         uint16_t word = d[0] | (d[1] << 8);
         fault_uv = (word & (1 << 0)) != 0;
         fault_ov = (word & (1 << 1)) != 0;
         fault_utc = (word & (1 << 2)) != 0;
         fault_otc = (word & (1 << 3)) != 0;
         fault_ocd1 = (word & (1 << 9)) != 0;
         fault_ocd2 = (word & (1 << 10)) != 0;
         fault_sc = (word & (1 << 11)) != 0;
         fault_iso = (word & (1 << 15)) != 0;
       }
       if (dlc >= 7) {
         if (d[6] > 0) {
           total_cells = d[6];
         }
       }
       if (dlc >= 8) {
         soc = d[7];
       }
     } else if (id == 0x18A11B02 && dlc >= 4) {
       pack_voltage = (float)((d[0] << 8) | d[1]) / 100.0f;
       int16_t raw_current = (int16_t)((d[2] << 8) | d[3]);
       pack_current = (float)raw_current / 100.0f;
     } else if (id == 0x18A11D02 && dlc >= 2) {
       int16_t raw_temp = (int16_t)((d[0] << 8) | d[1]);
       pack_temp = (float)raw_temp / 10.0f;
     } else if (id == 0x18A10F02 && dlc > 0) {
       cycle = d[dlc - 1];
       if (cycle < 1)
         cycle = 1;
     } else if (id == 0x18A11C02 && dlc >= 8) {
       max_v = (float)((d[0] << 8) | d[1]) / 1000.0f;
       min_v = (float)((d[2] << 8) | d[3]) / 1000.0f;
       max_cell_id = (d[4] << 8) | d[5];
       min_cell_id = (d[6] << 8) | d[7];
     } else if (id == 0x18A10102 && dlc >= 8) {
       bat_plus_v = (float)((d[0] << 8) | d[1]) / 100.0f;
       fc_v = (float)((d[2] << 8) | d[3]) / 100.0f;
       sc_v = (float)((d[4] << 8) | d[5]) / 100.0f;
       pchg_v = (float)((d[6] << 8) | d[7]) / 100.0f;
     } else if (id == 0x18A10202 && dlc >= 8) {
       dcdc_v = (float)((d[0] << 8) | d[1]) / 100.0f;
       dsg_v = (float)((d[4] << 8) | d[5]) / 100.0f;
 
       uint8_t relay_byte = d[7];
       relay_dsg = (relay_byte & (1 << 0)) != 0;
       relay_pchg = (relay_byte & (1 << 1)) != 0;
       relay_fc = (relay_byte & (1 << 2)) != 0;
       relay_sc = (relay_byte & (1 << 3)) != 0;
       relay_dcdc = (relay_byte & (1 << 4)) != 0;
       relay_out = (relay_byte & (1 << 5)) != 0;
       relay_neg_enb = (relay_byte & (1 << 6)) != 0;
       relay_pos_enb = (relay_byte & (1 << 7)) != 0;
     } else if (id == 0x18FF50E5 && dlc >= 5) {
       charger_voltage = (float)((d[0] << 8) | d[1]) / 10.0f;
       charger_current = (float)((d[2] << 8) | d[3]) / 10.0f;
       charger_err = d[4];
       charger_status = (charger_current > 0.1f) ? "Charging" : "Idle";
     } else if (id == 0x1801D08F && dlc >= 8) {
       dcdc_voltage_v = (float)((d[0] << 8) | d[1]) / 10.0f;
       dcdc_current_a = (float)((d[2] << 8) | d[3]) / 10.0f;
       dcdc_temp_c = (int16_t)d[7] - 40;
 
       uint8_t b4 = d[4];
       uint8_t b5 = d[5];
       dcdc_hvil_err = (b4 & (1 << 7)) != 0;
       dcdc_working = (b4 & (1 << 1)) != 0;
       dcdc_ready = (b4 & (1 << 0)) != 0;
       dcdc_over_temp = (b5 & (1 << 1)) != 0;
     } else if (id == 0x18F8622B && dlc >= 8) {
       uint8_t b0 = d[0];
       dcdc2_temp_c = (int16_t)d[1] - 40;
       dcdc2_voltage_v = (float)(d[2] | (d[3] << 8)) * 0.05f;
       dcdc2_current_a = (float)(d[4] | (d[5] << 8)) * 0.05f;
       dcdc2_err_flags = d[6];
       dcdc2_ver = d[7];
 
       dcdc2_work_val = (b0 >> 1) & 0x03;
       dcdc2_fault_val = (b0 >> 3) & 0x03;
       dcdc2_sys_val = (b0 >> 5) & 0x07;
     } else if (id == 0x10262B27 && dlc >= 8) {
       uint8_t b0 = d[0];
       dcdc2_cmd_vset = (float)(d[1] | (d[2] << 8)) * 0.1f;
       dcdc2_cmd_iset = (float)(d[3] | (d[4] << 8)) * 0.1f;
       uint8_t b7 = d[7];
 
       dcdc2_cmd_mode = b0 & 0x03;
       dcdc2_cmd_reset = b7 & 0x03;
     } else if (id >= 0x18A12402 && id <= 0x18A14102) {
       uint32_t offset = (id - 0x18A12402) / 0x100;
       uint32_t das = offset / 3;
       uint32_t frame_in_das = offset % 3;
       for (int k = 0; k < 4; k++) {
         int cell_in_das = frame_in_das * 4 + k;
         int cell_idx = das * 12 + cell_in_das;
         if (cell_idx >= 0 && cell_idx < 3) {
           int a = 2 * k;
           if (a + 1 < dlc) {
             uint16_t mv = (d[a] << 8) | d[a + 1];
             cell_v[cell_idx] = (float)mv / 1000.0f;
           }
         }
       }
     } else if (id >= 0x18A14202 && id <= 0x18A14B02) {
       uint32_t das = (id - 0x18A14202) / 0x100;
       float temps[4];
       int count = 0;
       for (int k = 0; k < 4; k++) {
         int a = 2 * k;
         if (a + 1 < dlc) {
           int16_t raw = (int16_t)((d[a] << 8) | d[a + 1]);
           temps[k] = (float)raw / 10.0f;
           count++;
         }
       }
       if (count > 0) {
         float avg = 0;
         for (int k = 0; k < count; k++)
           avg += temps[k];
         avg /= count;
         int base_cell = das * 12;
         for (int i = 0; i < 12; i++) {
           int cell_idx = base_cell + i;
           if (cell_idx >= 0 && cell_idx < 3) {
             cell_t[cell_idx] = avg;
           }
         }
       }
     }
 
    updateEvccInfo(id);
  }
}
 
void requestMotorParams() {
  uint8_t rpmQuery[4] = {0x40, 0x21, 0x20, 0x06};
  canTx(0x601, rpmQuery, 4);
  delayMicroseconds(500);
  uint8_t tempQuery[4] = {0x40, 0x23, 0x20, 0x1E};
  canTx(0x601, tempQuery, 4);
  delayMicroseconds(500);
  uint8_t runtimeQuery[4] = {0x40, 0x21, 0x20, 0x19};
  canTx(0x601, runtimeQuery, 4);
}
 
 void printBmsJson() {
   DynamicJsonDocument doc(2048);
 
   // BMS
   JsonObject bms = doc["bms"].to<JsonObject>();
   bms["soc"] = soc;
   bms["pack_voltage_v"] = pack_voltage;
   bms["pack_current_a"] = pack_current;
   bms["pack_temp_c"] = pack_temp;
 
   JsonObject faults = bms["faults"].to<JsonObject>();
   faults["UV"] = fault_uv;
   faults["OV"] = fault_ov;
   faults["OTC"] = fault_otc;
   faults["UTC"] = fault_utc;
   faults["OCD1"] = fault_ocd1;
   faults["OCD2"] = fault_ocd2;
   faults["SC"] = fault_sc;
   faults["ISO"] = fault_iso;
 
   // Cells
   JsonObject cells = doc["cells"].to<JsonObject>();
   cells["total_cells"] = total_cells;
   cells["cycle"] = cycle;
   cells["min_v"] = min_v;
   cells["max_v"] = max_v;
   cells["min_cell_id"] = min_cell_id;
   cells["max_cell_id"] = max_cell_id;
 
   JsonArray voltages = cells["voltages"].to<JsonArray>();
   for (int i = 0; i < 3; i++)
     voltages.add(cell_v[i]);
 
   JsonArray temps = cells["temperatures"].to<JsonArray>();
   for (int i = 0; i < 3; i++)
     temps.add(cell_t[i]);
 
   // HV
   JsonObject hv = doc["hv"].to<JsonObject>();
   hv["bat_plus_v"] = bat_plus_v;
   hv["fc_v"] = fc_v;
   hv["dcdc_v"] = dcdc_v;
   hv["dsg_v"] = dsg_v;
   hv["sc_v"] = sc_v;
   hv["pchg_v"] = pchg_v;
 
   // Relays
   JsonObject relays = doc["relays"].to<JsonObject>();
   relays["DSG+"] = relay_dsg;
   relays["PCHG+"] = relay_pchg;
   relays["FC+"] = relay_fc;
   relays["SC+"] = relay_sc;
   relays["DC-DC+"] = relay_dcdc;
   relays["OUT-"] = relay_out;
   relays["NEG_ENB"] = relay_neg_enb;
   relays["POS_ENB"] = relay_pos_enb;
 
   // DC-DC
   JsonObject dcdc = doc["dcdc"].to<JsonObject>();
   dcdc["voltage_v"] = dcdc_voltage_v;
   dcdc["current_a"] = dcdc_current_a;
   dcdc["temp_c"] = dcdc_temp_c;
   dcdc["ready"] = dcdc_ready;
   dcdc["working"] = dcdc_working;
   dcdc["hvil_err"] = dcdc_hvil_err;
   dcdc["over_temperature"] = dcdc_over_temp;
 
   // DC-DC 2
   JsonObject dcdc2 = doc["dcdc2"].to<JsonObject>();
   dcdc2["voltage_v"] = dcdc2_voltage_v;
   dcdc2["current_a"] = dcdc2_current_a;
   dcdc2["temp_c"] = dcdc2_temp_c;
   
   if (dcdc2_work_val == 0) dcdc2["work_state"] = "Stop";
   else if (dcdc2_work_val == 1) dcdc2["work_state"] = "Charging";
   else if (dcdc2_work_val == 2) dcdc2["work_state"] = "Charging completed";
   else dcdc2["work_state"] = "Reserved";
 
   if (dcdc2_fault_val == 0) dcdc2["fault_level"] = "Level 1 (Highest)";
   else if (dcdc2_fault_val == 1) dcdc2["fault_level"] = "Level 2";
   else if (dcdc2_fault_val == 2) dcdc2["fault_level"] = "Level 3";
   else dcdc2["fault_level"] = "Level 4 (Lowest)";
 
   if (dcdc2_sys_val == 0) dcdc2["sys_state"] = "Ready";
   else if (dcdc2_sys_val == 1 || dcdc2_sys_val == 4) dcdc2["sys_state"] = "Power Up";
   else if (dcdc2_sys_val == 5) dcdc2["sys_state"] = "Error";
   else if (dcdc2_sys_val == 7) dcdc2["sys_state"] = "Diag_Cali";
   else {
     char sys_buf[16];
     snprintf(sys_buf, sizeof(sys_buf), "State %d", dcdc2_sys_val);
     dcdc2["sys_state"] = sys_buf;
   }
 
   dcdc2["err_flags"] = dcdc2_err_flags;
   dcdc2["version"] = dcdc2_ver;
 
   JsonObject dcdc2_cmd = dcdc2["cmd"].to<JsonObject>();
   if (dcdc2_cmd_mode == 0) dcdc2_cmd["mode"] = "Disable Working";
   else if (dcdc2_cmd_mode == 1) dcdc2_cmd["mode"] = "Enable Working";
   else dcdc2_cmd["mode"] = "Reserved";
 
   dcdc2_cmd["v_set"] = dcdc2_cmd_vset;
   dcdc2_cmd["i_set"] = dcdc2_cmd_iset;
 
   if (dcdc2_cmd_reset == 0) dcdc2_cmd["reset"] = "No reset";
   else if (dcdc2_cmd_reset == 1) dcdc2_cmd["reset"] = "Reset";
   else dcdc2_cmd["reset"] = "Reserved";
 
   // Charger
   JsonObject charger = doc["charger"].to<JsonObject>();
   charger["status"] = charger_status;
   charger["voltage_v"] = charger_voltage;
   charger["current_a"] = charger_current;
   charger["error_code"] = charger_err;
 
   // Motor
   JsonObject motor = doc["motor"].to<JsonObject>();
   motor["rpm"] = rpm;
   motor["temp_c"] = motor_temp;
   motor["runtime"] = motor_runtime;
 
   // EVCC
   JsonObject evcc = doc["evcc"].to<JsonObject>();
   evcc["last_msg_code"] = evcc_last_msg_code;
   evcc["last_can_id"] = evcc_last_can_id;
   evcc["description"] = evcc_description;
 
   // Timestamp
   doc["ts"] = (uint32_t)(millis() / 1000);
 
   // Serialize and print
   serializeJson(doc, Serial);
   Serial.println(); // newline delimiter for parsing
 }
 
 // ══════════════════════════════════════════════════════════════════════════════
 // JSON Command Parser
 // ══════════════════════════════════════════════════════════════════════════════
 
 void processJsonCommand(const String &line) {
   DynamicJsonDocument doc(JSON_RX_DOC_SIZE);
   DeserializationError err = deserializeJson(doc, line);
   if (err) {
     sendError("JSON parse error");
     return;
   }
 
   const char *cmd = doc["cmd"];
   if (!cmd) {
     sendError("Missing cmd field");
     return;
   }
 
   if (strcmp(cmd, "diagnosis") == 0 || strcmp(cmd, "dignosis") == 0) {
     csvLogMode = false;
     diagnosisMode = true;
     lastDiagnosisPrintMs = millis() - 1000; // print immediately
     StaticJsonDocument<JSON_TX_DOC_SIZE> resp;
     resp["status"] = "ok";
     resp["mode"] = "diagnosis";
     sendJsonResponse(resp);
     return;
   }
 
   if (strcmp(cmd, "csv") == 0) {
     diagnosisMode = false;
     csvLogMode = true;
     csvLogBufLen = 0;
     csvLogFlushMs = millis();
     StaticJsonDocument<JSON_TX_DOC_SIZE> resp;
     resp["status"] = "ok";
     resp["mode"] = "csvlog";
     resp["record_size"] = CSVLOG_RECORD_SIZE;
     resp["fmt"] = "b64bin"; // Android: decode b64 → 18-byte records
     sendJsonResponse(resp);
     return;
   }
 
   // Any other command automatically deactivates diagnosisMode / csvLogMode
   diagnosisMode = false;
   csvLogMode = false;
 
   if (strcmp(cmd, "start") == 0) {
     if (!doc.containsKey("crc32") || !doc.containsKey("total")) {
       sendError("start requires crc32 and total");
       return;
     }
     uint32_t crc32 = doc["crc32"].as<uint32_t>();
     uint32_t total = doc["total"].as<uint32_t>();
     uint32_t pacing =
         doc.containsKey("pacing") ? doc["pacing"].as<uint32_t>() : 500;
     bool bench = doc.containsKey("bench") ? doc["bench"].as<bool>() : false;
     handleStart(crc32, total, pacing, bench);
   } else if (strcmp(cmd, "data") == 0) {
     if (!doc.containsKey("batch")) {
       sendError("data requires batch");
       return;
     }
     uint32_t batch = doc["batch"].as<uint32_t>();
 
     if (doc.containsKey("b64")) {
       // ── Preferred: base64 binary payload ──
       const char *b64 = doc["b64"].as<const char *>();
       if (!b64) {
         sendError("b64 must be a string");
         return;
       }
       handleDataBatchB64(batch, b64);
     } else if (doc.containsKey("frames")) {
       // ── Legacy: JSON array of arrays ──
       JsonArray framesArr = doc["frames"].as<JsonArray>();
       handleDataBatch(batch, framesArr);
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
 
 // ══════════════════════════════════════════════════════════════════════════════
 // Arduino Setup & Loop
 // ══════════════════════════════════════════════════════════════════════════════
 
 void setup() {
   // Increase USB CDC RX buffer for large batch payloads
   Serial.setRxBufferSize(16384);
   Serial.begin(UART_BAUD);
   // Wait for USB CDC host with a 3-second timeout so the ESP32
   // can still boot standalone without a USB host connected.
   {
     uint32_t t = millis();
     while (!Serial && millis() - t < 3000)
       delay(10);
   }
   delay(500);
 
   if (!canInit()) {
     Serial.println("{\"status\":\"error\",\"msg\":\"CAN init failed\"}");
     while (1)
       delay(1000);
   }
 
   Serial.println(
       "{\"status\":\"boot\",\"version\":\"2.0\",\"can\":\"500kbps\"}");
 }
 
 void loop() {
   static char rxBuffer[16384];
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
       rxIndex = 0;          // reset buffer
     } else if (c != '\r') { // ignore carriage return
       if (rxIndex < sizeof(rxBuffer) - 1) {
         rxBuffer[rxIndex++] = c;
       } else {
         // Buffer overflow: reset buffer to avoid corruption
         rxIndex = 0;
         sendError("Serial RX buffer overflow");
       }
     }
   }
 
   // Diagnosis Mode Async Loop
   if (diagnosisMode) {
     // 1. Read any available CAN frames and parse them
     CanFrame frame;
     while (ESP32Can.readFrame(frame, 0)) {
       parseDiagnosisCanFrame(frame);
     }
 
     // 2. Query motor parameters at 1 Hz
     uint32_t now = millis();
     if (now - lastMotorRequestMs >= 1000) {
       requestMotorParams();
       lastMotorRequestMs = now;
     }
 
     // 3. Print BMS telemetry JSON at 1 Hz
     if (now - lastDiagnosisPrintMs >= 1000) {
       printBmsJson();
       lastDiagnosisPrintMs = now;
     }
   }
 
  // CAN Logger Async Loop
  if (csvLogMode) {
    CanFrame frame;
    while (ESP32Can.readFrame(frame, 0)) {
      csvLogAddFrame(frame);
      // Flush immediately if buffer is full
      if (csvLogBufLen + CSVLOG_RECORD_SIZE > sizeof(csvLogBuf))
        csvLogFlush();
    }
    // Poll motor SDO (RPM / temp / runtime) so csvlog stream includes 0x581 responses
    uint32_t now = millis();
    if (now - lastMotorRequestMs >= 1000) {
      requestMotorParams();
      lastMotorRequestMs = now;
    }
    // Periodic flush so Android gets data even on quiet buses
    if (now - csvLogFlushMs >= CSVLOG_FLUSH_MS) {
      csvLogFlush();
      csvLogFlushMs = now;
    }
  }
 
   delay(1);
 }
 