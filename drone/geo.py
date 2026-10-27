"""Geodesy helpers: GPS <-> local metres and image pixel -> ground position.

Local frame is ENU around the home point: x = metres East, y = metres North.
Over a farm field (< 1 km) a flat-earth approximation is accurate to mm.
"""

import math

EARTH_RADIUS_M = 6378137.0


def offset_to_latlon(lat0, lon0, east_m, north_m):
    """Return the (lat, lon) that lies east_m / north_m from (lat0, lon0)."""
    dlat = north_m / EARTH_RADIUS_M
    dlon = east_m / (EARTH_RADIUS_M * math.cos(math.radians(lat0)))
    return lat0 + math.degrees(dlat), lon0 + math.degrees(dlon)


def latlon_to_offset(lat0, lon0, lat, lon):
    """Return (east_m, north_m) of (lat, lon) relative to (lat0, lon0)."""
    north = math.radians(lat - lat0) * EARTH_RADIUS_M
    east = math.radians(lon - lon0) * EARTH_RADIUS_M * math.cos(math.radians(lat0))
    return east, north


def haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance between two GPS points in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def camera_footprint(altitude_m, hfov_deg, vfov_deg):
    """Ground area (width_m, height_m) seen by a nadir camera at altitude_m."""
    width = 2 * altitude_m * math.tan(math.radians(hfov_deg) / 2)
    height = 2 * altitude_m * math.tan(math.radians(vfov_deg) / 2)
    return width, height


def ground_sample_distance_cm(altitude_m, hfov_deg, image_width_px):
    """Centimetres of ground per image pixel (GSD)."""
    width_m, _ = camera_footprint(altitude_m, hfov_deg, hfov_deg)
    return 100.0 * width_m / image_width_px


def pixel_to_local(px, py, img_w, img_h, drone_x, drone_y, altitude_m,
                   heading_deg, hfov_deg, vfov_deg):
    """Project an image pixel to the local ground frame.

    Assumes a gimbal-stabilised nadir camera whose image "up" points along the
    drone heading. Returns (east_m, north_m).
    """
    fw, fh = camera_footprint(altitude_m, hfov_deg, vfov_deg)
    # offset in the camera frame: right = +u, forward(up in image) = +v
    u = (px / img_w - 0.5) * fw
    v = (0.5 - py / img_h) * fh
    yaw = math.radians(heading_deg)          # heading: 0 = North, clockwise
    east = drone_x + u * math.cos(yaw) + v * math.sin(yaw)
    north = drone_y - u * math.sin(yaw) + v * math.cos(yaw)
    return east, north


def point_in_polygon(x, y, polygon):
    """Ray-casting test. polygon = [(x, y), ...]."""
    inside = False
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xin:
                inside = not inside
    return inside


def distance_to_polygon(x, y, polygon):
    """Distance from a point to the polygon boundary (0 if inside)."""
    if point_in_polygon(x, y, polygon):
        return 0.0
    best = float("inf")
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        seg = dx * dx + dy * dy
        t = 0.0 if seg == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / seg))
        best = min(best, math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
    return best


def bearing_deg(x1, y1, x2, y2):
    """Compass bearing (0 = North, clockwise) from point 1 to point 2."""
    return (math.degrees(math.atan2(x2 - x1, y2 - y1)) + 360.0) % 360.0
