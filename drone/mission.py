"""Autonomous detect-and-spray mission.

    PREFLIGHT -> TAKEOFF -> SURVEY (fly lawn-mower, photo at every point)
                                |-- YOLO detects weeds/crops in the photo
                                |-- pixels -> GPS (georeferencing)
                                |-- SPRAY: descend, visit weed clusters, spray
              -> RTL -> LANDED -> COMPLETE (weed map exported)

Failsafes checked continuously: low battery -> RTL, geofence breach -> RTL,
altitude limit -> RTL, operator abort -> RTL, empty tank -> survey only.
"""

import math
import threading
import time

import cv2

from drone import geo
from drone.config import resolve_path
from drone.mission_planner import plan_survey, path_length, estimate_flight_time_s
from drone.weed_map import WeedMap


class MissionAbort(Exception):
    pass


class Failsafe(Exception):
    pass


class PilotOverride(Exception):
    """Safety pilot switched the RC mode away from GUIDED - stop commanding."""


class MissionController:
    def __init__(self, cfg, fc, camera, sprayer, detector, publisher, clock,
                 field_polygon, world=None):
        self.cfg = cfg
        self.fc, self.camera, self.sprayer, self.detector = fc, camera, sprayer, detector
        self.pub, self.clock = publisher, clock
        self.field = [tuple(p) for p in field_polygon]
        self.world = world
        m = cfg["mission"]
        self.home_lat, self.home_lon = m["home"]["lat"], m["home"]["lon"]
        self.survey_alt = float(m["survey_altitude_m"])
        self.spray_alt = float(m["spray_altitude_m"])
        self.speed = float(m["speed_m_s"])
        self.strategy = m["strategy"]
        self.cluster_radius = float(m["cluster_radius_m"])
        self.blanket_ml_m2 = float(m.get("blanket_rate_l_ha", 300)) * 1000 / 10000
        self.safety = cfg["safety"]
        self.accept_r = float(cfg["flight_controller"]["acceptance_radius_m"])
        self.telemetry_period = 1.0 / float(cfg["telemetry"]["rate_hz"])
        s = cfg["sprayer"]
        self.spray_ms = float(s["spray_duration_ms"])
        self.crop_margin = float(s["crop_safety_margin_m"])

        self.weed_map = WeedMap(merge_radius_m=0.25)
        self.state = "IDLE"
        self.spray_enabled = self.strategy == "detect_and_spray"
        self.wp_index, self.waypoints = 0, []
        self.photos, self.inference_ms = 0, []
        self.distance_m = 0.0
        self._spraying = False
        self._last_pos = None
        self._last_tel = 0.0
        self._abort = threading.Event()
        self._paused = threading.Event()
        self._t_start = None

    # ================================================================ control
    def abort(self):
        self._abort.set()

    def pause(self):
        self._paused.set()
        self.log("Mission paused - holding position")

    def resume(self):
        self._paused.clear()
        self.log("Mission resumed")

    def set_spray_enabled(self, on):
        self.spray_enabled = bool(on)
        self.log(f"Spraying {'enabled' if on else 'disabled'}")

    # ================================================================ helpers
    def log(self, msg, level="info"):
        self.pub.publish({"type": "log", "t": self._t(), "level": level, "msg": msg})

    def _t(self):
        return round(self.clock.now() - self._t_start, 2) if self._t_start is not None else 0.0

    def _set_state(self, state):
        self.state = state
        self.pub.publish({"type": "state", "t": self._t(), "state": state})

    def _local(self, st):
        return geo.latlon_to_offset(self.home_lat, self.home_lon, st.lat, st.lon)

    def _latlon(self, x, y):
        return geo.offset_to_latlon(self.home_lat, self.home_lon, x, y)

    def _telemetry(self, st, force=False):
        now = time.monotonic()
        x, y = self._local(st)
        if self._last_pos is not None:
            self.distance_m += math.dist(self._last_pos, (x, y))
        self._last_pos = (x, y)
        if not force and now - self._last_tel < self.telemetry_period:
            return
        self._last_tel = now
        self.pub.publish({
            "type": "telemetry", "t": self._t(),
            "x": round(x, 3), "y": round(y, 3),
            "lat": round(st.lat, 8), "lon": round(st.lon, 8), "alt": round(st.alt, 2),
            "heading": round(st.heading, 1), "speed": round(st.groundspeed, 2),
            "climb": round(st.climb, 2), "battery": round(st.battery_pct, 1),
            "voltage": round(st.voltage, 2), "mode": st.mode, "armed": st.armed,
            "gps_fix": st.gps_fix, "sats": st.satellites,
            "tank": round(self.sprayer.tank_pct, 1), "state": self.state,
            "wp": self.wp_index, "wp_total": len(self.waypoints),
            "spraying": self._spraying, "speedup": getattr(self.clock, "speedup", 1.0),
        })

    def _check_failsafes(self, st):
        if self._abort.is_set():
            raise MissionAbort("Operator abort")
        if self.state in ("SURVEY", "SPRAY") and st.mode not in ("GUIDED", "UNKNOWN"):
            raise PilotOverride(f"Pilot switched to {st.mode}")
        if st.battery_pct <= self.safety["rtl_battery_pct"]:
            raise Failsafe(f"Low battery {st.battery_pct:.0f}%")
        x, y = self._local(st)
        if geo.distance_to_polygon(x, y, self.field) > self.safety["geofence_margin_m"]:
            raise Failsafe("Geofence breach")
        if st.alt > self.safety["max_altitude_m"]:
            raise Failsafe("Altitude limit")

    def _wait(self, predicate, timeout_s=120):
        """Poll the vehicle until predicate(state) is true, with failsafes."""
        t0 = self.clock.now()
        while True:
            st = self.fc.state()
            self._telemetry(st)
            if predicate(st):
                return st
            self._check_failsafes(st)
            if self.clock.now() - t0 > timeout_s:
                raise Failsafe("Manoeuvre timeout")
            time.sleep(0.04)

    def fly_to(self, x, y, alt):
        lat, lon = self._latlon(x, y)
        self.fc.goto(lat, lon, alt)

        def arrived(st):
            if self._paused.is_set():
                self.fc.hold()
                while self._paused.is_set():
                    s = self.fc.state()
                    self._telemetry(s)
                    self._check_failsafes(s)
                    time.sleep(0.05)
                self.fc.goto(lat, lon, alt)
                return False
            cx, cy = self._local(st)
            return math.hypot(cx - x, cy - y) < self.accept_r and abs(st.alt - alt) < 0.3

        return self._wait(arrived)

    # ================================================================ phases
    def preflight(self):
        self._set_state("PREFLIGHT")
        st = self.fc.state()
        self._telemetry(st, force=True)
        checks = [
            ("GPS fix", st.gps_fix >= self.safety["require_gps_fix"], f"fix={st.gps_fix} sats={st.satellites}"),
            ("Battery", st.battery_pct >= self.safety["min_battery_start_pct"], f"{st.battery_pct:.0f}%"),
            ("Sprayer link", self.sprayer.ping(), f"tank {self.sprayer.tank_pct:.0f}%"),
            ("AI model", self.detector is not None, "YOLO11 loaded"),
            ("Geofence", len(self.field) >= 3, f"{len(self.field)} vertices"),
        ]
        ok = True
        for name, passed, detail in checks:
            self.log(f"Preflight {name}: {'PASS' if passed else 'FAIL'} ({detail})",
                     "info" if passed else "error")
            ok &= bool(passed)
        if not ok:
            raise RuntimeError("Preflight checks failed")

    def takeoff(self):
        self._set_state("TAKEOFF")
        self.fc.set_mode("GUIDED")
        self.fc.arm()
        self.sprayer.arm()
        self.log("Armed - taking off")
        self.fc.takeoff(self.survey_alt)
        self._wait(lambda s: s.alt >= self.survey_alt * 0.95)
        self.fc.set_speed(self.speed)
        self.log(f"Reached survey altitude {self.survey_alt:.0f} m")

    def capture_and_detect(self, index):
        st = self.fc.state()
        frame, meta = self.camera.capture()
        if frame is None:
            self.log(f"WP {index + 1}: no image (outside field)", "warn")
            return [], []
        self.photos += 1
        x, y = self._local(st)
        # sim photos are centred on their tile (like a distance-triggered camera)
        x, y = meta.get("center_x", x), meta.get("center_y", y)
        alt = max(st.alt, 0.5)
        if self.cfg["camera"].get("save_frames") and meta.get("source") != "sim":
            out = resolve_path(self.cfg["camera"]["frames_dir"])
            out.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(out / f"wp{index + 1:03d}_{st.lat:.7f}_{st.lon:.7f}.jpg"), frame)

        detections, ms = self.detector.detect(frame)
        self.inference_ms.append(ms)
        h, w = frame.shape[:2]
        boxes, weeds, crops = [], [], []
        for d in detections:
            cx, cy = d.center
            gx, gy = geo.pixel_to_local(cx, cy, w, h, x, y, alt, st.heading,
                                        self.camera.hfov_deg, self.camera.vfov_deg)
            fw, _ = geo.camera_footprint(alt, self.camera.hfov_deg, self.camera.vfov_deg)
            size_m = max(d.x2 - d.x1, d.y2 - d.y1) / w * fw
            lat, lon = self._latlon(gx, gy)
            item, _new = self.weed_map.add(d.class_name, d.confidence, gx, gy, lat, lon,
                                          tile=meta.get("tile"), size_m=size_m)
            box = d.to_dict()
            box.update(id=item["id"], gx=round(gx, 3), gy=round(gy, 3),
                       lat=round(lat, 8), lon=round(lon, 8), size_m=round(size_m, 3))
            boxes.append(box)
            if self.detector.is_weed(d):
                weeds.append(item)
            elif self.detector.is_crop(d):
                crops.append((item, size_m))

        self.pub.publish({
            "type": "detections", "t": self._t(), "wp": index, "tile": meta.get("tile"),
            "image_url": meta.get("image_url"), "img_w": w, "img_h": h,
            "x": round(x, 3), "y": round(y, 3), "alt": round(alt, 2),
            "inference_ms": round(ms, 1), "boxes": boxes,
            "n_weed": len(weeds), "n_crop": len(crops),
        })
        self.log(f"WP {index + 1}/{len(self.waypoints)}: {len(weeds)} weeds, "
                 f"{len(crops)} crops ({ms:.0f} ms)")
        return weeds, crops

    def _spray_targets(self, weeds, crops):
        """Drop weeds touching a crop, then group nearby weeds into clusters."""
        safe = []
        for w in weeds:
            if w["sprayed"]:
                continue
            near_crop = any(math.hypot(w["x"] - c["x"], w["y"] - c["y"]) < size / 2 + self.crop_margin
                            for c, size in crops)
            if near_crop:
                self.log(f"Weed #{w['id']} skipped - too close to crop", "warn")
                continue
            safe.append(w)
        clusters = []
        remaining = safe[:]
        while remaining:
            seed = remaining.pop(0)
            group = [seed] + [w for w in remaining
                              if math.hypot(w["x"] - seed["x"], w["y"] - seed["y"]) < self.cluster_radius]
            remaining = [w for w in remaining if w not in group]
            cx = sum(w["x"] for w in group) / len(group)
            cy = sum(w["y"] for w in group) / len(group)
            clusters.append((cx, cy, group))
        return clusters

    def spray_weeds(self, weeds, crops):
        if not (self.spray_enabled and weeds):
            return
        if self.sprayer.empty:
            self.log("Tank empty - continuing in survey-only mode", "warn")
            return
        clusters = self._spray_targets(weeds, crops)
        if not clusters:
            return
        self._set_state("SPRAY")
        # nearest-neighbour ordering from the current position
        pos = self._local(self.fc.state())
        ordered = []
        while clusters:
            nxt = min(clusters, key=lambda c: math.dist(pos, c[:2]))
            clusters.remove(nxt)
            ordered.append(nxt)
            pos = nxt[:2]
        for cx, cy, group in ordered:
            if self.sprayer.empty:
                self.log("Tank empty", "warn")
                break
            self.fly_to(cx, cy, self.spray_alt)
            self._spraying = True
            self._telemetry(self.fc.state(), force=True)
            ml = self.sprayer.spray(self.spray_ms)
            self._spraying = False
            ids = [w["id"] for w in group]
            self.weed_map.mark_sprayed(ids)
            lat, lon = self._latlon(cx, cy)
            self.pub.publish({"type": "spray", "t": self._t(), "x": round(cx, 3), "y": round(cy, 3),
                              "lat": lat, "lon": lon, "ml": round(ml, 2), "weed_ids": ids,
                              "tank": round(self.sprayer.tank_pct, 1)})
        self._set_state("SURVEY")

    def _wait_landed(self, timeout_s=900):
        t0 = self.clock.now()
        while self.clock.now() - t0 < timeout_s:
            st = self.fc.state()
            self._telemetry(st)
            if not st.armed:
                break
            time.sleep(0.2)
        self._set_state("LANDED")
        self.sprayer.disarm()

    def return_home(self, reason="Mission complete"):
        self._set_state("RTL")
        self.log(f"RTL: {reason}")
        self.fc.rtl()
        t0 = self.clock.now()
        while True:
            st = self.fc.state()
            self._telemetry(st)
            if not st.armed and st.alt < 0.3:
                break
            if self.clock.now() - t0 > 600:
                self.log("RTL timeout", "error")
                break
            time.sleep(0.05)
        self._telemetry(self.fc.state(), force=True)
        self._set_state("LANDED")
        self.sprayer.disarm()

    # ================================================================ main
    def plan(self):
        fw, fh = geo.camera_footprint(self.survey_alt, self.camera.hfov_deg, self.camera.vfov_deg)
        m = self.cfg["mission"]
        self.waypoints = plan_survey(self.field, fw, fh, m["front_overlap"], m["side_overlap"])
        event = {
            "type": "plan", "home": {"lat": self.home_lat, "lon": self.home_lon},
            "field": self.field, "waypoints": [[round(x, 3), round(y, 3)] for x, y in self.waypoints],
            "altitude": self.survey_alt, "spray_altitude": self.spray_alt, "speed": self.speed,
            "strategy": self.strategy, "footprint": [round(fw, 2), round(fh, 2)],
            "path_length_m": round(path_length(self.waypoints), 1),
            "est_time_s": round(estimate_flight_time_s(self.waypoints, self.speed, self.survey_alt)),
            "area_m2": round(self._area(), 1),
            "blanket_ml": round(self._area() * self.blanket_ml_m2, 1),
            "world": self.world.describe() if self.world else None,
        }
        self.pub.publish(event)
        self.log(f"Survey planned: {len(self.waypoints)} photo points, "
                 f"{event['path_length_m']} m path, footprint {fw:.1f} x {fh:.1f} m")

    def _area(self):
        return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2)
                       in zip(self.field, self.field[1:] + self.field[:1]))) / 2

    def summary(self, outcome):
        s = self.weed_map.summary()
        area = self._area()
        blanket = area * self.blanket_ml_m2
        used = self.sprayer.total_ml
        return {
            "outcome": outcome, "flight_time_s": round(self._t(), 1),
            "distance_m": round(self.distance_m, 1), "photos": self.photos,
            "area_m2": round(area, 1), **s, "spray_shots": self.sprayer.spray_count,
            "herbicide_ml": round(used, 1), "blanket_ml": round(blanket, 1),
            "savings_pct": round(100 * (1 - used / blanket), 1) if blanket else 0.0,
            "avg_inference_ms": round(sum(self.inference_ms) / len(self.inference_ms), 1)
            if self.inference_ms else 0.0,
        }

    def export(self, log_dir):
        log_dir = resolve_path(log_dir)
        log_dir.mkdir(parents=True, exist_ok=True)
        self.weed_map.to_csv(log_dir / "weed_map.csv")
        self.weed_map.save_geojson(log_dir / "weed_map.geojson")
        self.weed_map.save_kml(log_dir / "weed_map.kml")
        self.log(f"Weed map exported to {log_dir} (CSV, GeoJSON, KML)")

    def run(self):
        self._t_start = self.clock.now()
        self.pub.publish({"type": "mission", "state": "started", "t": 0})
        outcome = "complete"
        try:
            self.plan()
            self.preflight()
            self.takeoff()
            self._set_state("SURVEY")
            for i, (x, y) in enumerate(self.waypoints):
                self.wp_index = i
                self.fly_to(x, y, self.survey_alt)
                weeds, crops = self.capture_and_detect(i)
                if self.strategy == "detect_and_spray":
                    self.spray_weeds(weeds, crops)
            self.wp_index = len(self.waypoints)
            self.return_home()
        except MissionAbort as exc:
            outcome = "aborted"
            self.log(str(exc), "warn")
            self.return_home(str(exc))
        except PilotOverride as exc:
            outcome = "pilot_override"
            self.log(f"{exc} - companion computer released control", "warn")
            self._wait_landed()
        except Failsafe as exc:
            outcome = "failsafe"
            self.log(f"FAILSAFE: {exc}", "error")
            self.return_home(str(exc))
        except Exception as exc:
            outcome = "error"
            self.log(f"Mission error: {exc}", "error")
            try:
                if self.fc.state().armed:
                    self.return_home("error")
            except Exception:
                pass
        finally:
            self._spraying = False
        self.export(self.cfg["telemetry"]["log_dir"])
        summary = self.summary(outcome)
        self._set_state("COMPLETE" if outcome == "complete" else "ABORTED")
        self.pub.publish({"type": "mission", "state": "finished", "t": self._t(), "summary": summary})
        return summary
