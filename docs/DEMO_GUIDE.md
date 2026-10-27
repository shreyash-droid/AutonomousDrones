# Presentation & Demo Guide

A 10–12 minute walkthrough for the faculty review. It shows that the project is a complete
autonomous-drone system that is ready for hardware, even though it is demonstrated
without the aircraft.

## Before the presentation (5 min)

1. `pip install -r requirements.txt` (only once).
2. Run `python -m unittest discover tests -v`. All 18 tests should pass.
3. Start the GCS: double-click `run_demo.bat`, or run `python simulation/server.py`.
   Open http://localhost:8000 and check that the badge says **LIVE AI · SIM SERVER**.
4. Backup plan: if the laptop has problems, open `simulation/web/index.html` directly.
   The badge then says **OFFLINE REPLAY**. It shows the same mission, recorded from the simulator.

## Demo script

| # | Show | Say |
|---|---|---|
| 0 | Website http://localhost:3000 (`run_dashboard.bat`) | Scroll the landing page: hero animation, how it works, real AI detections, hardware diagram, impact. |
| 1 | README diagram | "The drone photographs the field. YOLO11 finds weeds, we convert pixels to GPS, and we spray only the weeds." |
| 2 | **Hardware & Architecture** tab | "This is the aircraft: Pixhawk for flight, Raspberry Pi for AI, Arduino for the pump. Every block has driver code in `drone/` and `firmware/`." |
| 3 | `configs/drone_config.yaml`, line `mode: sim` | "One config switch selects simulation, ArduPilot SITL, or the real hardware. The mission code is identical in all three." |
| 4 | **Mission Control** → Start mission (speed 4×) | Narrate: preflight checks in the log, takeoff, survey lane 1. |
| 5 | Camera panel | "This is the real YOLO11 model running now on the real drone image under the aircraft. Red boxes are weeds, green boxes are crops." |
| 6 | Map: red dots turning violet | "Each detection is georeferenced. The drone drops to 3 m and spot-sprays each weed cluster. Watch the herbicide tank drop." |
| 7 | Log: *"Weed #… skipped - too close to crop"* | "Safety rule: we never spray within 15 cm of a crop plant." |
| 8 | Hover a weed on the map | "Every weed has GPS coordinates and confidence, and we know whether it was sprayed." |
| 9 | Press **Pause**, then **Abort / RTL** (or let it finish) | "The operator can hold or abort. Low battery or a geofence breach triggers RTL automatically." |
| 10 | Summary dialog | "36 L of blanket spraying vs ≈ 1.3 L spot spraying, about 96 % less chemical." Download the GeoJSON. |
| 11 | Dashboard → **Detect**, **Batch report**, **Flight logs** | Upload any field photo and adjust the confidence live. Show the per-image charts, then the GPS weed map of the mission you just flew. |

## Questions the faculty may ask

**Q: Without hardware, how do we know the code would work on the drone?**
The flight controller driver speaks standard MAVLink 2 (`pymavlink`): GUIDED mode,
`SET_POSITION_TARGET_GLOBAL_INT`, `MAV_CMD_NAV_TAKEOFF` and RTL. This is the same
interface Mission Planner and DroneKit use. It can be tested against **ArduPilot SITL**, the real
ArduCopter firmware running on a PC (`python -m drone.main --mode sitl`, see `hardware/README.md`).
The simulator only replaces the physics, the camera and the pump. The mission logic,
AI and georeferencing are the same code that runs on the Pi.

**Q: How is a pixel converted into a GPS position?**
At altitude *h*, a camera with field of view *FOV* sees a ground width of
`2·h·tan(FOV/2)`. A pixel's offset from the image centre, as a fraction of the image, times
that width, gives metres east/north (rotated by the heading). Metres are then converted
to latitude/longitude around the drone's GPS fix. The code is in `drone/geo.py` and is
unit-tested.

**Q: How fast is detection on the drone?**
About 100–250 ms per image on a laptop CPU. On a Raspberry Pi 5 with the NCNN export
(`hardware/export_model.py`) expect a few hundred ms per 640 × 640 frame. That is enough,
because the drone hovers for each photo. A Jetson Orin Nano with TensorRT runs it in real time.

**Q: What if the AI makes a mistake or something fails?**
Three layers of protection:
1. The mission software checks battery, geofence, altitude and the crop safety margin.
2. Pixhawk failsafes handle battery, RC loss, GCS loss, EKF and the fence.
3. The sprayer firmware has a link watchdog, an RC kill switch, a 3 s maximum spray and a tank-empty switch.

The safety pilot can always take over with the mode switch. The software detects this and stops commanding the drone.

**Q: Why spot spraying?**
Herbicide is sprayed only where weeds are. This means less chemical cost, less soil and water
contamination, and less damage to the crop. The mission report quantifies the saving for each flight.

**Q: What is still needed to fly it for real?**
Buy and assemble the parts in `hardware/README.md` (≈ ₹ 57k), flash ArduCopter, load
`ardupilot_params.param`, run `hardware/setup_raspberry_pi.sh`, flash the Arduino firmware, run
`hardware/check_hardware.py`, and fly. No software changes are required.
