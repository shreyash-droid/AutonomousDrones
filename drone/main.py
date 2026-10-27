"""Entry point of the onboard software.

    python -m drone.main --mode sim                  # everything simulated (console)
    python -m drone.main --mode sitl                 # ArduPilot SITL + simulated camera/sprayer
    python -m drone.main --mode hardware             # real aircraft (run on the Raspberry Pi)
    python -m drone.main --export-plan mission.waypoints   # write plan for Mission Planner/QGC

On the aircraft this is started at boot by hardware/weed-drone.service and
waits for the pilot's "start" (or starts immediately with --autostart).
"""

import argparse
import json
import time

from drone import geo
from drone.clock import RealClock, SimClock
from drone.config import load_config
from drone.telemetry import (ConsolePublisher, JsonlLogger, MultiPublisher,
                             WebSocketPublisher)


def field_polygon_local(cfg):
    m = cfg["mission"]
    if m.get("field_polygon_latlon"):
        lat0, lon0 = m["home"]["lat"], m["home"]["lon"]
        return [geo.latlon_to_offset(lat0, lon0, lat, lon) for lat, lon in m["field_polygon_latlon"]]
    return [tuple(p) for p in m["field_local_m"]]


def build_system(cfg, mode, publisher, detector=None, speedup=None):
    """Create (controller, components) for the requested mode."""
    from drone.camera import SimCamera, build_camera
    from drone.flight_controller import MavlinkFlightController, SimFlightController
    from drone.mission import MissionController
    from drone.sprayer import SimSprayer, build_sprayer

    if detector is None:
        from drone.detector import WeedDetector
        detector = WeedDetector(cfg["detector"])

    m, s, sim = cfg["mission"], cfg["sprayer"], cfg["sim"]
    world = None

    if mode == "hardware":
        clock = RealClock()
        fcfg = cfg["flight_controller"]
        fc = MavlinkFlightController(fcfg["connection"], fcfg["baud"], fcfg["heartbeat_timeout_s"])
        fc.connect()
        camera = build_camera(cfg)
        sprayer = build_sprayer(cfg, fc)
        field = field_polygon_local(cfg)
    else:
        from drone.sim_world import SimWorld
        world = SimWorld(cfg)
        field = world.field_polygon()
        if mode == "sitl":
            clock = RealClock()   # SITL runs its own physics in real time
            fcfg = cfg["flight_controller"]
            fc = MavlinkFlightController(fcfg["sitl_connection"], heartbeat_timeout_s=fcfg["heartbeat_timeout_s"])
            fc.connect()
            # the SimCamera needs the local position; in SITL GPS is the ground truth
            def true_position():
                st = fc.state()
                return (*geo.latlon_to_offset(m["home"]["lat"], m["home"]["lon"], st.lat, st.lon), st.alt)
            fc.true_position = true_position
        else:
            clock = SimClock(speedup if speedup is not None else sim["speedup"])
            fc = SimFlightController(clock, m["home"]["lat"], m["home"]["lon"],
                                     sim["start_battery_pct"], sim["battery_drain_pct_per_min"],
                                     sim["gps_noise_m"], rtl_alt=m["survey_altitude_m"])
            fc.connect()
        camera = SimCamera(world, fc)
        camera.hfov_deg = camera.vfov_deg = world.camera_fov_deg(m["survey_altitude_m"])
        sprayer = SimSprayer(clock, s["tank_capacity_ml"], s["flow_rate_ml_s"])

    camera.open()
    sprayer.open()
    controller = MissionController(cfg, fc, camera, sprayer, detector, publisher, clock, field, world)
    return controller, (fc, camera, sprayer)


def shutdown(components):
    for c in components:
        try:
            c.close()
        except Exception as exc:
            print(f"close {type(c).__name__}: {exc}")


def main():
    ap = argparse.ArgumentParser(description="Autonomous weed detection & spraying drone")
    ap.add_argument("--mode", choices=["sim", "sitl", "hardware"])
    ap.add_argument("--config", help="path to drone_config.yaml")
    ap.add_argument("--gcs", help="Ground station WebSocket URL, e.g. ws://192.168.1.10:8000/ws/drone")
    ap.add_argument("--speedup", type=float, help="simulation speed factor")
    ap.add_argument("--survey-only", action="store_true", help="map weeds, do not spray")
    ap.add_argument("--export-plan", metavar="FILE", help="write .waypoints file and exit")
    ap.add_argument("--autostart", action="store_true",
                    help="hardware: start immediately instead of waiting for ENTER")
    ap.add_argument("--wait-guided", action="store_true",
                    help="hardware: start only when the safety pilot selects GUIDED on the RC")
    args = ap.parse_args()

    overrides = {}
    if args.survey_only:
        overrides["mission"] = {"strategy": "survey_only"}
    cfg = load_config(args.config, overrides)
    mode = args.mode or cfg.get("mode", "sim")

    if args.export_plan:
        from drone.mission_planner import export_waypoints_file, plan_survey
        m, c = cfg["mission"], cfg["camera"]
        fw, fh = geo.camera_footprint(m["survey_altitude_m"], c["hfov_deg"], c["vfov_deg"])
        pts = plan_survey(field_polygon_local(cfg), fw, fh, m["front_overlap"], m["side_overlap"])
        export_waypoints_file(args.export_plan, pts, m["home"]["lat"], m["home"]["lon"],
                              m["survey_altitude_m"], m["speed_m_s"])
        print(f"Wrote {len(pts)} survey points to {args.export_plan}")
        return

    publishers = [ConsolePublisher(), JsonlLogger(cfg["telemetry"]["log_dir"])]
    gcs = args.gcs or (cfg["telemetry"]["gcs_url"] if mode == "hardware" else None)
    if gcs:
        publishers.append(WebSocketPublisher(gcs))
    pub = MultiPublisher(*publishers)

    print(f"=== Weed drone | mode={mode} ===")
    controller, components = build_system(cfg, mode, pub, speedup=args.speedup)
    try:
        fc = components[0]
        if args.wait_guided:
            print("Waiting for the safety pilot to select GUIDED mode on the RC transmitter ...")
            while fc.state().mode != "GUIDED":
                time.sleep(0.5)
            print("GUIDED selected - starting mission")
        elif mode == "hardware" and not args.autostart:
            input("All checks ready. Clear the area and press ENTER to start the mission...")
        summary = controller.run()
        print("\nMission summary:\n" + json.dumps(summary, indent=2))
    except KeyboardInterrupt:
        print("Ctrl+C -> aborting, returning to launch")
        controller.return_home("Operator Ctrl+C")
    finally:
        pub.close()
        shutdown(components)


if __name__ == "__main__":
    main()
