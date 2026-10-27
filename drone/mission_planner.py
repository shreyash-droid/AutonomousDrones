"""Survey path planning ("lawn-mower" / boustrophedon coverage).

Given the field boundary and the camera footprint, generate photo points that
cover the whole field with the requested overlap. The plan can also be
exported as a QGroundControl / Mission Planner .waypoints file so it can be
flown by the Pixhawk alone (AUTO mode) as a backup.
"""

import math

from drone import geo


def lane_spacing(footprint_w, side_overlap):
    return footprint_w * (1.0 - side_overlap)


def _scan_intersections(polygon, y):
    xs = []
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        if (y1 <= y < y2) or (y2 <= y < y1):
            xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
    return sorted(xs)


def plan_survey(polygon, footprint_w, footprint_h, front_overlap=0.0, side_overlap=0.0):
    """Return photo points [(x, y), ...] in local metres covering polygon.

    Lanes run East-West, stepping North. Works for any simple polygon
    (convex or concave) via scan-line intersection.
    """
    ys = [p[1] for p in polygon]
    y_min, y_max = min(ys), max(ys)
    dy = lane_spacing(footprint_h, side_overlap)
    dx = footprint_w * (1.0 - front_overlap)

    height = y_max - y_min
    n_lanes = 1 if height <= footprint_h else math.ceil((height - footprint_h) / dy - 1e-9) + 1
    lane_step = 0.0 if n_lanes == 1 else (height - footprint_h) / (n_lanes - 1)
    lane_ys = ([y_min + height / 2] if n_lanes == 1 else
               [y_min + footprint_h / 2 + k * lane_step for k in range(n_lanes)])

    points = []
    for lane, y in enumerate(lane_ys):
        xs = _scan_intersections(polygon, min(y, y_max - 1e-6))
        lane_pts = []
        for i in range(0, len(xs) - 1, 2):
            x_start, x_end = xs[i], xs[i + 1]
            span = x_end - x_start
            n = max(1, math.ceil((span - footprint_w) / dx - 1e-9) + 1) if span > footprint_w else 1
            if n == 1:
                lane_pts.append(((x_start + x_end) / 2, y))
            else:
                step = (span - footprint_w) / (n - 1)
                lane_pts.extend((x_start + footprint_w / 2 + k * step, y) for k in range(n))
        if lane % 2 == 1:
            lane_pts.reverse()
        points.extend(lane_pts)
    return points


def path_length(points, start=(0.0, 0.0)):
    total, prev = 0.0, start
    for p in points:
        total += math.dist(prev, p)
        prev = p
    return total + math.dist(prev, start)


def estimate_flight_time_s(points, speed_m_s, altitude_m, per_photo_s=1.0, climb_rate=2.0):
    return path_length(points) / speed_m_s + len(points) * per_photo_s + 2 * altitude_m / climb_rate


def export_waypoints_file(path, points, home_lat, home_lon, altitude_m, speed_m_s):
    """Write a QGC WPL 110 file (opens in Mission Planner and QGroundControl)."""
    MAV_CMD_NAV_WAYPOINT, MAV_CMD_NAV_TAKEOFF, MAV_CMD_NAV_RTL = 16, 22, 20
    MAV_CMD_DO_CHANGE_SPEED, MAV_CMD_DO_DIGICAM_CONTROL = 178, 203
    rows = [(0, 1, 0, 16, 0, 0, 0, 0, home_lat, home_lon, 0, 1)]          # home
    seq = 1

    def add(frame, cmd, p1=0, p2=0, p3=0, p4=0, lat=0, lon=0, alt=0):
        nonlocal seq
        rows.append((seq, 0, frame, cmd, p1, p2, p3, p4, lat, lon, alt, 1))
        seq += 1

    add(3, MAV_CMD_NAV_TAKEOFF, alt=altitude_m)
    add(3, MAV_CMD_DO_CHANGE_SPEED, 1, speed_m_s, -1)
    for x, y in points:
        lat, lon = geo.offset_to_latlon(home_lat, home_lon, x, y)
        add(3, MAV_CMD_NAV_WAYPOINT, 1, 0, 0, 0, lat, lon, altitude_m)    # hold 1 s
        add(3, MAV_CMD_DO_DIGICAM_CONTROL, 0, 0, 0, 0, 1, 0, 0)           # trigger photo
    add(3, MAV_CMD_NAV_RTL)

    with open(path, "w", encoding="utf-8") as f:
        f.write("QGC WPL 110\n")
        for r in rows:
            f.write("\t".join(f"{v:.8f}" if isinstance(v, float) else str(v) for v in r) + "\n")
    return path
