"""Tests for the onboard software.  Run:  python -m unittest discover tests -v

The mission tests use a stub detector so they run in seconds without the
YOLO model; tests/test_detector.py exercises the real model.
"""

import math
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from drone import geo
from drone.detector import Detection
from drone.main import build_system
from drone.config import load_config
from drone.mission_planner import plan_survey, export_waypoints_file
from drone.telemetry import CallbackPublisher
from drone.weed_map import WeedMap


class StubDetector:
    """Returns two weeds and one crop for every image."""
    confidence = 0.25

    def detect(self, frame):
        h, w = frame.shape[:2]
        return [Detection("weed", 0.9, 0.2 * w, 0.2 * h, 0.22 * w, 0.22 * h),
                Detection("weed", 0.8, 0.7 * w, 0.7 * h, 0.72 * w, 0.72 * h),
                Detection("crop", 0.7, 0.45 * w, 0.45 * h, 0.55 * w, 0.55 * h)], 5.0

    def is_weed(self, d):
        return d.class_name == "weed"

    def is_crop(self, d):
        return d.class_name != "weed"


class GeoTests(unittest.TestCase):
    def test_roundtrip(self):
        lat, lon = geo.offset_to_latlon(22.975, 88.434, 37.5, -12.25)
        e, n = geo.latlon_to_offset(22.975, 88.434, lat, lon)
        self.assertAlmostEqual(e, 37.5, places=3)
        self.assertAlmostEqual(n, -12.25, places=3)

    def test_haversine_matches_flat_earth(self):
        lat, lon = geo.offset_to_latlon(22.975, 88.434, 30, 40)
        self.assertAlmostEqual(geo.haversine_m(22.975, 88.434, lat, lon), 50.0, delta=0.05)

    def test_footprint(self):
        w, h = geo.camera_footprint(10, 90, 90)
        self.assertAlmostEqual(w, 20.0, places=6)

    def test_pixel_to_local_center_and_corner(self):
        # image centre -> directly below the drone
        x, y = geo.pixel_to_local(320, 320, 640, 640, 5, 5, 10, 0, 90, 90)
        self.assertAlmostEqual(x, 5)
        self.assertAlmostEqual(y, 5)
        # top-right pixel, heading north -> north-east of the drone
        x, y = geo.pixel_to_local(640, 0, 640, 640, 0, 0, 10, 0, 90, 90)
        self.assertAlmostEqual(x, 10)
        self.assertAlmostEqual(y, 10)
        # heading east: image "up" now points east
        x, y = geo.pixel_to_local(320, 0, 640, 640, 0, 0, 10, 90, 90, 90)
        self.assertAlmostEqual(x, 10)
        self.assertAlmostEqual(y, 0, places=6)

    def test_polygon(self):
        sq = [(0, 0), (10, 0), (10, 10), (0, 10)]
        self.assertTrue(geo.point_in_polygon(5, 5, sq))
        self.assertFalse(geo.point_in_polygon(15, 5, sq))
        self.assertAlmostEqual(geo.distance_to_polygon(13, 5, sq), 3)


class PlannerTests(unittest.TestCase):
    def test_grid_matches_tiles(self):
        pts = plan_survey([(0, 0), (40, 0), (40, 30), (0, 30)], 10, 10)
        self.assertEqual(len(pts), 12)
        self.assertEqual(pts[:4], [(5, 5), (15, 5), (25, 5), (35, 5)])
        self.assertEqual(pts[4], (35, 15))           # second lane reversed (boustrophedon)

    def test_full_coverage_with_overlap(self):
        field = [(0, 0), (52, 0), (52, 33), (0, 33)]
        pts = plan_survey(field, 12, 9, 0.2, 0.3)
        for gx in range(0, 53, 2):                   # every ground point is inside a photo
            for gy in range(0, 34, 2):
                self.assertTrue(any(abs(gx - x) <= 6 + 1e-6 and abs(gy - y) <= 4.5 + 1e-6 for x, y in pts),
                                f"({gx},{gy}) not covered")

    def test_concave_polygon(self):
        L = [(0, 0), (30, 0), (30, 10), (10, 10), (10, 30), (0, 30)]
        pts = plan_survey(L, 10, 10)
        self.assertTrue(all(geo.point_in_polygon(x, y, L) for x, y in pts))

    def test_waypoint_file(self):
        out = Path(__file__).parent / "_tmp.waypoints"
        export_waypoints_file(out, [(5, 5), (15, 5)], 22.975, 88.434, 10, 3)
        lines = out.read_text().splitlines()
        out.unlink()
        self.assertEqual(lines[0], "QGC WPL 110")
        self.assertEqual(len(lines), 1 + 1 + 2 + 2 * 2 + 1)   # header, home, takeoff+speed, 2x(wp+cam), rtl


class WeedMapTests(unittest.TestCase):
    def test_merge_duplicates(self):
        m = WeedMap(merge_radius_m=0.25)
        a, new_a = m.add("weed", 0.6, 1.0, 1.0, 0, 0)
        b, new_b = m.add("weed", 0.9, 1.1, 1.0, 0, 0)
        self.assertTrue(new_a)
        self.assertFalse(new_b)
        self.assertEqual(len(m.items), 1)
        self.assertEqual(a["conf"], 0.9)
        m.add("weed", 0.7, 3.0, 3.0, 0, 0)
        self.assertEqual(m.summary()["weeds"], 2)


class SimMissionTests(unittest.TestCase):
    def run_mission(self, overrides=None, speedup=200, during=None):
        cfg = load_config(overrides={"telemetry": {"rate_hz": 50, "log_dir": "logs/test"}, **(overrides or {})})
        events = []
        ctrl, comps = build_system(cfg, "sim", CallbackPublisher(events.append), StubDetector(), speedup)
        if during:
            threading.Timer(0.5, during, args=(ctrl,)).start()
        summary = ctrl.run()
        return summary, events, ctrl

    def test_full_mission(self):
        summary, events, ctrl = self.run_mission()
        self.assertEqual(summary["outcome"], "complete")
        self.assertEqual(summary["photos"], 12)
        self.assertEqual(summary["weeds"], 24)
        self.assertEqual(summary["weeds_sprayed"], 24)
        self.assertGreater(summary["savings_pct"], 90)
        types = {e["type"] for e in events}
        self.assertTrue({"plan", "telemetry", "detections", "spray", "mission"} <= types)
        # landed and disarmed back at home
        st = ctrl.fc.state()
        self.assertFalse(st.armed)
        x, y = geo.latlon_to_offset(ctrl.home_lat, ctrl.home_lon, st.lat, st.lon)
        self.assertLess(math.hypot(x, y), 1.0)

    def test_georeferenced_weeds_inside_their_tile(self):
        _, events, ctrl = self.run_mission({"mission": {"strategy": "survey_only"}})
        tiles = {t["id"]: t for t in ctrl.world.tiles}
        for ev in (e for e in events if e["type"] == "detections"):
            t = tiles[ev["tile"]]
            for b in ev["boxes"]:
                self.assertTrue(t["x0"] <= b["gx"] <= t["x1"] and t["y0"] <= b["gy"] <= t["y1"])

    def test_survey_only_does_not_spray(self):
        summary, events, _ = self.run_mission({"mission": {"strategy": "survey_only"}})
        self.assertEqual(summary["spray_shots"], 0)
        self.assertFalse(any(e["type"] == "spray" for e in events))

    def test_low_battery_failsafe(self):
        summary, events, ctrl = self.run_mission({"sim": {"start_battery_pct": 65,
                                                         "battery_drain_pct_per_min": 30}})
        self.assertEqual(summary["outcome"], "failsafe")
        self.assertLess(summary["photos"], 12)
        self.assertFalse(ctrl.fc.state().armed)

    def test_operator_abort(self):
        summary, _, ctrl = self.run_mission(speedup=20, during=lambda c: c.abort())
        self.assertEqual(summary["outcome"], "aborted")
        self.assertFalse(ctrl.fc.state().armed)

    def test_preflight_rejects_low_battery(self):
        summary, events, _ = self.run_mission({"sim": {"start_battery_pct": 40}})
        self.assertEqual(summary["outcome"], "error")
        self.assertTrue(any(e["type"] == "log" and "FAIL" in e["msg"] for e in events))


if __name__ == "__main__":
    unittest.main()
