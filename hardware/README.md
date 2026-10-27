# Hardware Guide: Building the Weed-Spraying Drone

This folder holds everything needed to turn the simulation into a real aircraft.
The onboard software in [`drone/`](../drone) is already hardware-ready. Switching
`mode: sim` to `mode: hardware` in [`configs/drone_config.yaml`](../configs/drone_config.yaml)
swaps the simulated drivers for the real ones. The mission logic does not change.

| File | Purpose |
|---|---|
| [`ardupilot_params.param`](ardupilot_params.param) | Pixhawk parameters (companion link, failsafes, geofence, relay) |
| [`setup_raspberry_pi.sh`](setup_raspberry_pi.sh) | One-shot setup of the Raspberry Pi companion computer |
| [`weed-drone.service`](weed-drone.service) | systemd unit: starts the mission software at boot |
| [`check_hardware.py`](check_hardware.py) | Bench test of the FC link, camera, AI and sprayer (props off!) |
| [`export_model.py`](export_model.py) | Export YOLO11 to NCNN / ONNX / TensorRT and benchmark it |
| [`requirements-pi.txt`](requirements-pi.txt) | Python packages for the Pi |
| [`../firmware/sprayer_controller/`](../firmware/sprayer_controller/sprayer_controller.ino) | Arduino Nano pump-controller firmware |

---

## 1. Bill of materials

Prices are approximate Indian retail prices (2025-26). They are given for budgeting only.

| # | Component | Example part | Qty | Approx. ₹ |
|---|---|---|---|---|
| 1 | Frame | F450 / S500 quad frame with landing gear | 1 | 1,500 |
| 2 | Motors | 2212 920 KV brushless | 4 | 3,200 |
| 3 | ESCs | 30 A BLHeli-S (DShot) | 4 | 2,400 |
| 4 | Propellers | 1045 (10 × 4.5") CW/CCW pairs | 2 sets | 400 |
| 5 | Flight controller | Pixhawk 2.4.8 (or Holybro Pixhawk 6C) | 1 | 6,500 |
| 6 | GPS + compass | Ublox M8N / M10 with mast | 1 | 2,000 |
| 7 | Power module | 5.3 V / 90 A analog PM (V+I sensing) | 1 | 800 |
| 8 | Battery | 4S 5200 mAh 35C LiPo | 1 | 5,500 |
| 9 | RC transmitter + receiver | FlySky FS-i6X + FS-iA10B (10 ch) | 1 | 5,000 |
| 10 | Telemetry radio | SiK 433 MHz pair | 1 | 2,500 |
| 11 | Companion computer | Raspberry Pi 5, 8 GB + active cooler | 1 | 8,500 |
| 12 | Camera | Raspberry Pi Camera Module 3 / v2 | 1 | 2,500 |
| 13 | Camera gimbal | 2-axis brushless or servo gimbal | 1 | 2,500 |
| 14 | 5 V supply for the Pi | 5 V 5 A UBEC | 1 | 600 |
| 15 | Sprayer MCU | Arduino Nano (ATmega328P) | 1 | 400 |
| 16 | Pump | 12 V diaphragm pump (≈ 1.5 L/min) | 1 | 700 |
| 17 | Pump driver | IRLZ44N logic-level MOSFET + 1N5822 flyback diode | 1 | 100 |
| 18 | Flow sensor | YF-S201 hall flow sensor | 1 | 300 |
| 19 | Tank + nozzle | 2 L tank, flat-fan nozzle, 6 mm tubing | 1 | 600 |
| 20 | Float switch | Side-mount liquid level switch | 1 | 150 |
| 21 | 12 V supply for the pump | 4S → 12 V 3 A buck converter | 1 | 300 |
| 22 | Misc. | XT60, wires, heat-shrink, vibration dampers, buzzer | — | 1,000 |
| | **Total** | | | **≈ ₹ 57,000** |

**Payload budget:** 2 L of liquid adds about 2 kg. For a full tank, use 1255 props with
a 4S 8000 mAh battery or a hexacopter frame. For the 1 L college prototype, the F450 setup
above is enough.

---

## 2. System wiring

```
                         ┌──────────────── 4S LiPo ────────────────┐
                         │                                          │
                   Power module ──(V/I sense)──► Pixhawk POWER1     ├──► 5 V UBEC ──► Raspberry Pi 5 (USB-C/5V pins)
                         │                                          └──► 12 V buck ──► Pump (via MOSFET)
                        PDB ──► 4 × ESC ──► 4 × motor
                                   ▲
                       Pixhawk MAIN OUT 1-4

  GPS/compass ─── GPS1 + I2C ─┐
  RC receiver ─── RC IN (SBUS) ┼──► PIXHAWK ◄── TELEM1 ── SiK radio ~~~~ safety-pilot laptop (Mission Planner)
  Buzzer/switch ─ ports        ┘        │
                                   TELEM2 (MAVLink2 @ 921600)
                                        │
                   Raspberry Pi 5 GPIO14 (TX) / GPIO15 (RX) / GND
                         │                         │
            Pi Camera (CSI-2 ribbon)       USB ── Arduino Nano ── D5 ─► MOSFET gate ─► pump
                                                       │   D2 ◄─ flow sensor
                                                       │   D3 ◄─ RC receiver CH8 (kill switch)
                                                       │   D4 ◄─ float switch
                                                       └── D8 ─► buzzer, D13 status LED
                         Wi-Fi / 4G dongle ~~~~ ground-station laptop running simulation/server.py
```

### Pixhawk TELEM2 ↔ Raspberry Pi

| Pixhawk TELEM2 pin | Signal | Raspberry Pi pin |
|---|---|---|
| 1 | +5 V | **not connected** (the Pi has its own UBEC) |
| 2 | TX (out) | GPIO15 / RXD (pin 10) |
| 3 | RX (in) | GPIO14 / TXD (pin 8) |
| 6 | GND | GND (pin 6) |

### Arduino Nano sprayer controller

| Nano pin | Connected to | Notes |
|---|---|---|
| D5 | IRLZ44N gate through 220 Ω, 10 kΩ pull-down to GND | Pump on/off |
| D6 | Second MOSFET → solenoid valve (optional) | Opens together with the pump |
| D2 | YF-S201 signal (yellow), 10 kΩ pull-up to 5 V | Interrupt pulse counter |
| D3 | RC receiver channel 8 signal | Hardware kill switch (> 1700 µs = kill) |
| D4 | Float switch to GND | INPUT_PULLUP, LOW = liquid present |
| D8 | Active buzzer | Failsafe beeps |
| USB | Raspberry Pi USB-A | Serial 115200 baud, appears as `/dev/ttyUSB0` |
| GND | Common ground with the 12 V pump supply | **Required** |

The pump goes from +12 V to the MOSFET drain, and the MOSFET source goes to GND. Put a
1N5822 flyback diode across the pump terminals.

---

## 3. Build and bring-up procedure

1. **Frame:** assemble the frame and motors. Mount the Pixhawk on dampers with the arrow
   pointing forward. Put the GPS on its mast.
2. **ArduPilot:** flash ArduCopter 4.5 with Mission Planner. Run the wizard: frame (Quad X),
   accelerometer, compass, radio, ESC calibration, and flight modes.
3. **Parameters:** load [`ardupilot_params.param`](ardupilot_params.param) (Full Parameter
   List → Load → Write) and reboot.
4. **Maiden flight:** hover in LOITER with no payload. Check vibration and tune if needed
   (AUTOTUNE).
5. **Companion computer:** flash Raspberry Pi OS Bookworm 64-bit, clone this repo, then:
   ```bash
   bash hardware/setup_raspberry_pi.sh
   sudo reboot
   ```
6. **Sprayer firmware:** open `firmware/sprayer_controller/sprayer_controller.ino` in the
   Arduino IDE (Board: Arduino Nano, Processor: ATmega328P (Old Bootloader) for most
   clones) and upload it. Test it in the Serial Monitor (115200, newline):
   `PING` → `PONG`, `ARM`, `SPRAY 500`, `STATUS`.
7. **Flow calibration:** pump exactly 1 L, read `total` pulses, then send `CAL <pulses>`.
   Put the measured ml/s into `sprayer.flow_rate_ml_s`.
8. **Bench test with props removed:**
   ```bash
   .venv/bin/python hardware/check_hardware.py --spray-test
   ```
9. **Field setup:** walk the field corners with a phone GPS and put them in
   `mission.field_polygon_latlon`. Set `mission.home` to the take-off point.
   Check the plan in Mission Planner:
   ```bash
   .venv/bin/python -m drone.main --export-plan logs/mission.waypoints
   ```
10. **Ground station:** on the laptop run `python simulation/server.py`. Set
    `telemetry.gcs_url` on the Pi to `ws://<laptop-ip>:8000/ws/drone`.

---

## 4. Flight procedure (two-person crew)

| Step | Safety pilot (RC) | Operator (GCS laptop) |
|---|---|---|
| 1 | Props on, battery in, stand 10 m back | Open http://localhost:8000 → badge shows **HARDWARE LINK** |
| 2 | Mode switch = LOITER | Check the GPS 3D fix, battery > 60 %, tank level |
| 3 | Flip mode switch to **GUIDED** | The software arms, takes off, and flies the survey |
| 4 | Watch the aircraft, hand on the switch | Watch the map, camera feed and detections |
| 5 | **Any problem → switch to LOITER** (the software releases control) or RTL | |
| 6 | The aircraft returns and lands by itself | Download the weed map (GeoJSON / CSV / KML) |

Layered failsafes:

- **Companion computer:** low battery, geofence, altitude limit, operator abort → RTL.
- **Pixhawk:** battery FS, RC loss, GCS-heartbeat loss, EKF FS, fence → RTL or land.
- **Sprayer MCU:** link watchdog, RC kill switch, maximum spray time, tank-empty switch.

> Follow the DGCA Drone Rules 2021: register the drone on Digital Sky, fly in green zones
> only, stay below 120 m, keep visual line of sight, and handle agrochemicals with PPE.
> Use water only while testing.

---

## 5. Testing the real flight code without the aircraft (ArduPilot SITL)

SITL runs the **real ArduCopter firmware** on a PC. In this mode the flight-controller
side uses the same MAVLink code path as the real Pixhawk:

```bash
# Linux / WSL2 (one-time): https://ardupilot.org/dev/docs/building-setup-linux.html
git clone --recursive https://github.com/ArduPilot/ardupilot && cd ardupilot
Tools/environment_install/install-prereqs-ubuntu.sh -y && . ~/.profile
sim_vehicle.py -v ArduCopter --console --map --custom-location=22.975,88.434,10,0

# second terminal, in this project
python -m drone.main --mode sitl
```

The camera and sprayer stay simulated in SITL. The drone flies real ArduCopter
GUIDED-mode navigation, and you can watch it in the MAVProxy map or in
Mission Planner / QGroundControl.
