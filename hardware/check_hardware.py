"""Bench test of every hardware component - run on the Raspberry Pi
with the PROPELLERS REMOVED before the first flight.

    python hardware/check_hardware.py                 # all checks, no spraying
    python hardware/check_hardware.py --spray-test    # also pulse the pump 500 ms
    python hardware/check_hardware.py --only camera   # single component
"""

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from drone.config import load_config

OK, FAIL = "\033[92mPASS\033[0m", "\033[91mFAIL\033[0m"


def check_flight_controller(cfg):
    from drone.flight_controller import MavlinkFlightController
    f = cfg["flight_controller"]
    fc = MavlinkFlightController(f["connection"], f["baud"], f["heartbeat_timeout_s"])
    fc.connect()
    time.sleep(2)
    s = fc.state()
    print(f"  mode={s.mode} armed={s.armed}")
    print(f"  GPS fix={s.gps_fix} sats={s.satellites} lat={s.lat:.7f} lon={s.lon:.7f}")
    print(f"  alt={s.alt:.1f} m heading={s.heading:.0f} deg battery={s.battery_pct:.0f}% {s.voltage:.2f} V")
    fc.close()
    return s.gps_fix >= 3


def check_camera(cfg):
    import cv2
    from drone.camera import build_camera
    cam = build_camera(cfg)
    cam.open()
    frame, meta = cam.capture()
    cam.close()
    out = ROOT / "logs" / "camera_test.jpg"
    out.parent.mkdir(exist_ok=True)
    cv2.imwrite(str(out), frame)
    print(f"  frame {frame.shape[1]}x{frame.shape[0]} from {meta['source']} -> {out}")
    return frame


def check_detector(cfg, frame=None):
    from drone.detector import WeedDetector
    det = WeedDetector(cfg["detector"])
    det.warmup()
    if frame is None:
        import cv2
        frame = cv2.imread(str(ROOT / "test_images" / "field.jpg"))
    dets, ms = det.detect(frame)
    print(f"  {len(dets)} detections in {ms:.0f} ms "
          f"({sum(det.is_weed(d) for d in dets)} weeds, {sum(det.is_crop(d) for d in dets)} crops)")
    return ms < 2000


def check_sprayer(cfg, spray_test):
    from drone.sprayer import build_sprayer
    sp = build_sprayer(cfg)
    sp.open()
    if hasattr(sp, "_send"):
        print("  " + (sp._send("STATUS", "STATUS") or "no STATUS reply"))
    if spray_test:
        input("  !! Pump will run for 500 ms. Point nozzle into a container and press ENTER")
        sp.arm()
        ml = sp.spray(500)
        print(f"  sprayed {ml:.1f} ml")
        sp.disarm()
    sp.close()
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["fc", "camera", "detector", "sprayer"])
    ap.add_argument("--spray-test", action="store_true")
    a = ap.parse_args()
    cfg = load_config()

    results, frame = {}, None
    steps = [("fc", "Flight controller (MAVLink)", lambda: check_flight_controller(cfg)),
             ("camera", "Camera", lambda: check_camera(cfg)),
             ("detector", "YOLO11 detector", lambda: check_detector(cfg, frame)),
             ("sprayer", "Sprayer controller", lambda: check_sprayer(cfg, a.spray_test))]
    for key, name, fn in steps:
        if a.only and a.only != key:
            continue
        print(f"\n[{name}]")
        try:
            r = fn()
            if key == "camera":
                frame, r = r, True
            results[name] = bool(r)
        except Exception as exc:
            print(f"  error: {exc}")
            results[name] = False

    print("\n========== summary ==========")
    for name, passed in results.items():
        print(f"  {OK if passed else FAIL}  {name}")
    sys.exit(0 if all(results.values()) else 1)


if __name__ == "__main__":
    main()
