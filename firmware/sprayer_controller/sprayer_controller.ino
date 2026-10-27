/*
 * ===================================================================
 *  Sprayer controller firmware  -  Arduino Nano (ATmega328P) / Uno
 * ===================================================================
 *  Receives commands from the Raspberry Pi (drone/sprayer.py,
 *  SerialSprayer) over USB serial and drives the herbicide pump.
 *
 *  Pin map
 *    D5  -> IRLZ44N MOSFET gate (via 220R, 10k pull-down) -> 12 V pump
 *    D6  -> solenoid valve MOSFET (optional, opens with the pump)
 *    D2  <- YF-S201 flow sensor signal (interrupt INT0, 10k pull-up)
 *    D3  <- RC receiver channel 8 PWM (kill switch, > 1700 us = KILL)
 *    D4  <- tank float switch (INPUT_PULLUP, LOW = liquid present)
 *    D13 -> status LED   (slow blink = disarmed, solid = armed, fast = spraying)
 *    D8  -> buzzer       (beeps on failsafe)
 *
 *  Serial protocol @115200 baud, '\n' terminated
 *    PING            -> PONG
 *    ARM             -> OK ARMED            (pump may run)
 *    DISARM          -> OK DISARMED
 *    SPRAY <ms>      -> OK SPRAY <ms> ... DONE <ml_dispensed>
 *    STOP            -> OK STOP
 *    STATUS          -> STATUS armed=1 pump=0 tank_ml=1834 total_ml=166 rc_kill=0 tank_empty=0
 *    TANK <ml>       -> OK TANK <ml>        (after refilling)
 *    CAL <pulses/L>  -> OK CAL <value>      (flow sensor calibration)
 *
 *  Failsafes (independent of the Raspberry Pi)
 *    - Max single spray 3000 ms
 *    - No message from the Pi for 3 s  -> pump OFF + DISARM
 *    - RC kill switch                  -> pump OFF immediately
 *    - Tank empty float switch         -> refuse to spray
 * ===================================================================
 */

#include <EEPROM.h>

// ------------------------------------------------------------------ pins
const uint8_t PIN_PUMP   = 5;
const uint8_t PIN_VALVE  = 6;
const uint8_t PIN_FLOW   = 2;
const uint8_t PIN_RC     = 3;
const uint8_t PIN_FLOAT  = 4;
const uint8_t PIN_LED    = 13;
const uint8_t PIN_BUZZER = 8;

// ------------------------------------------------------------------ tuning
const unsigned long MAX_SPRAY_MS    = 3000;
const unsigned long LINK_TIMEOUT_MS = 3000;
const unsigned int  RC_KILL_US      = 1700;
const float         DEFAULT_PULSES_PER_L = 450.0;  // YF-S201 datasheet ~450
const float         DEFAULT_TANK_ML      = 2000.0;
const int           EEPROM_CAL_ADDR      = 0;

// ------------------------------------------------------------------ state
volatile unsigned long flowPulses = 0;
float pulsesPerLitre = DEFAULT_PULSES_PER_L;
float tankMl = DEFAULT_TANK_ML;
float totalMl = 0;

bool armed = false;
bool pumpOn = false;
unsigned long sprayStart = 0;
unsigned long sprayDuration = 0;
unsigned long pulsesAtStart = 0;
unsigned long lastRx = 0;
bool rcKill = false;

char line[32];
uint8_t lineLen = 0;

void onFlowPulse() { flowPulses++; }

// ------------------------------------------------------------------ helpers
void setPump(bool on) {
  pumpOn = on;
  digitalWrite(PIN_PUMP, on ? HIGH : LOW);
  digitalWrite(PIN_VALVE, on ? HIGH : LOW);
}

void beep(uint8_t n) {
  for (uint8_t i = 0; i < n; i++) {
    digitalWrite(PIN_BUZZER, HIGH); delay(60);
    digitalWrite(PIN_BUZZER, LOW);  delay(60);
  }
}

bool tankEmpty() { return digitalRead(PIN_FLOAT) == HIGH || tankMl <= 1.0; }

float pulsesToMl(unsigned long p) { return 1000.0 * p / pulsesPerLitre; }

void finishSpray() {
  setPump(false);
  noInterrupts();
  unsigned long p = flowPulses - pulsesAtStart;
  interrupts();
  float ml = pulsesToMl(p);
  tankMl = max(0.0, tankMl - ml);
  totalMl += ml;
  Serial.print(F("DONE "));
  Serial.println(ml, 1);
  lastRx = millis();             // spray time does not count as link silence
}

void readRcKill() {
  // pulseIn with short timeout: no RC signal -> no kill (the Pixhawk handles RC loss)
  unsigned long us = pulseIn(PIN_RC, HIGH, 25000);
  rcKill = (us > RC_KILL_US);
}

// ------------------------------------------------------------------ commands
void handleCommand(char *cmd) {
  lastRx = millis();
  char *arg = strchr(cmd, ' ');
  if (arg) { *arg = '\0'; arg++; }

  if (!strcmp(cmd, "PING")) {
    Serial.println(F("PONG"));
  } else if (!strcmp(cmd, "ARM")) {
    armed = true;
    Serial.println(F("OK ARMED"));
  } else if (!strcmp(cmd, "DISARM")) {
    armed = false;
    if (pumpOn) finishSpray();
    Serial.println(F("OK DISARMED"));
  } else if (!strcmp(cmd, "STOP")) {
    if (pumpOn) finishSpray();
    Serial.println(F("OK STOP"));
  } else if (!strcmp(cmd, "SPRAY")) {
    unsigned long ms = arg ? strtoul(arg, NULL, 10) : 0;
    if (!armed)            { Serial.println(F("ERR NOT_ARMED")); return; }
    if (rcKill)            { Serial.println(F("ERR RC_KILL")); return; }
    if (tankEmpty())       { Serial.println(F("ERR TANK_EMPTY")); return; }
    if (pumpOn)            { Serial.println(F("ERR BUSY")); return; }
    if (ms == 0)           { Serial.println(F("ERR BAD_ARG")); return; }
    sprayDuration = min(ms, MAX_SPRAY_MS);
    noInterrupts(); pulsesAtStart = flowPulses; interrupts();
    sprayStart = millis();
    setPump(true);
    Serial.print(F("OK SPRAY "));
    Serial.println(sprayDuration);
  } else if (!strcmp(cmd, "STATUS")) {
    Serial.print(F("STATUS armed=")); Serial.print(armed);
    Serial.print(F(" pump="));        Serial.print(pumpOn);
    Serial.print(F(" tank_ml="));     Serial.print(tankMl, 0);
    Serial.print(F(" total_ml="));    Serial.print(totalMl, 0);
    Serial.print(F(" rc_kill="));     Serial.print(rcKill);
    Serial.print(F(" tank_empty="));  Serial.println(tankEmpty());
  } else if (!strcmp(cmd, "TANK")) {
    tankMl = arg ? atof(arg) : DEFAULT_TANK_ML;
    Serial.print(F("OK TANK ")); Serial.println(tankMl, 0);
  } else if (!strcmp(cmd, "CAL")) {
    float v = arg ? atof(arg) : 0;
    if (v > 50 && v < 5000) {
      pulsesPerLitre = v;
      EEPROM.put(EEPROM_CAL_ADDR, pulsesPerLitre);
    }
    Serial.print(F("OK CAL ")); Serial.println(pulsesPerLitre, 1);
  } else {
    Serial.println(F("ERR UNKNOWN"));
  }
}

void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line[lineLen] = '\0';
      if (lineLen) handleCommand(line);
      lineLen = 0;
    } else if (lineLen < sizeof(line) - 1) {
      line[lineLen++] = c;
    }
  }
}

// ------------------------------------------------------------------ setup / loop
void setup() {
  pinMode(PIN_PUMP, OUTPUT);
  pinMode(PIN_VALVE, OUTPUT);
  setPump(false);                 // pump OFF before anything else
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_FLOAT, INPUT_PULLUP);
  pinMode(PIN_RC, INPUT);
  pinMode(PIN_FLOW, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW), onFlowPulse, RISING);

  float cal;
  EEPROM.get(EEPROM_CAL_ADDR, cal);
  if (cal > 50 && cal < 5000) pulsesPerLitre = cal;

  Serial.begin(115200);
  Serial.println(F("SPRAYER READY v1.0"));
  lastRx = millis();
  beep(2);
}

void loop() {
  readSerial();

  static unsigned long lastRc = 0;
  if (millis() - lastRc > 100) { readRcKill(); lastRc = millis(); }

  // end of a commanded spray
  if (pumpOn && millis() - sprayStart >= sprayDuration) finishSpray();

  // hard failsafes
  if (pumpOn && (rcKill || !armed)) {
    finishSpray();
    Serial.println(F("FAILSAFE RC_KILL"));
    beep(3);
  }
  if (armed && !pumpOn && millis() - lastRx > LINK_TIMEOUT_MS) {
    armed = false;
    Serial.println(F("FAILSAFE LINK_LOST"));
    beep(5);
  }

  // status LED
  unsigned long period = pumpOn ? 100 : (armed ? 0 : 1000);
  if (period == 0) digitalWrite(PIN_LED, HIGH);
  else digitalWrite(PIN_LED, (millis() / period) % 2);
}
