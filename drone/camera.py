"""Downward-facing camera drivers.

PiCamera2Camera -> Raspberry Pi Camera Module (CSI ribbon)
OpenCVCamera    -> any USB / UVC camera
SimCamera       -> returns the field image under the simulated drone
"""

from abc import ABC, abstractmethod

import cv2


class Camera(ABC):
    hfov_deg: float
    vfov_deg: float

    def open(self):
        pass

    def close(self):
        pass

    @abstractmethod
    def capture(self):
        """Return (frame_bgr, meta_dict)."""


class PiCamera2Camera(Camera):
    def __init__(self, resolution=(1280, 960), hfov_deg=62.2, vfov_deg=48.8):
        self.resolution = tuple(resolution)
        self.hfov_deg, self.vfov_deg = hfov_deg, vfov_deg
        self.cam = None

    def open(self):
        from picamera2 import Picamera2   # only available on Raspberry Pi OS
        self.cam = Picamera2()
        config = self.cam.create_still_configuration(main={"size": self.resolution, "format": "RGB888"})
        self.cam.configure(config)
        # short fixed exposure reduces motion blur while flying
        self.cam.set_controls({"ExposureTime": 2000, "AnalogueGain": 2.0})
        self.cam.start()

    def capture(self):
        frame = self.cam.capture_array()   # RGB888 in picamera2 is BGR byte order
        return frame, {"source": "picamera2"}

    def close(self):
        if self.cam:
            self.cam.stop()


class OpenCVCamera(Camera):
    def __init__(self, index=0, resolution=(1280, 960), hfov_deg=62.2, vfov_deg=48.8):
        self.index = index
        self.resolution = tuple(resolution)
        self.hfov_deg, self.vfov_deg = hfov_deg, vfov_deg
        self.cap = None

    def open(self):
        self.cap = cv2.VideoCapture(self.index)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.resolution[0])
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open camera {self.index}")

    def capture(self):
        for _ in range(3):        # flush stale buffered frames
            self.cap.grab()
        ok, frame = self.cap.read()
        if not ok:
            raise RuntimeError("Camera read failed")
        return frame, {"source": f"opencv:{self.index}"}

    def close(self):
        if self.cap:
            self.cap.release()


class SimCamera(Camera):
    """Looks up which field tile is under the drone and returns that image."""

    def __init__(self, world, flight_controller):
        self.world = world
        self.fc = flight_controller
        self._cache = {}
        self.hfov_deg = self.vfov_deg = 60.0

    def capture(self):
        x, y, alt = self.fc.true_position()
        tile = self.world.tile_at(x, y)
        # FOV chosen so that one tile fills the frame -> georeferencing is exact
        self.hfov_deg = self.vfov_deg = self.world.camera_fov_deg(alt)
        if tile is None:
            return None, {"source": "sim", "tile": None}
        path = tile["path"]
        if path not in self._cache:
            self._cache[path] = cv2.imread(str(path))
        meta = {"source": "sim", "tile": tile["id"], "image_url": tile["url"],
                # the photo is centred on the tile, as if triggered over its centre
                "center_x": (tile["x0"] + tile["x1"]) / 2,
                "center_y": (tile["y0"] + tile["y1"]) / 2}
        return self._cache[path], meta


def build_camera(cfg):
    c = cfg["camera"]
    if c["type"] == "picamera2":
        return PiCamera2Camera(c["resolution"], c["hfov_deg"], c["vfov_deg"])
    if c["type"] == "opencv":
        return OpenCVCamera(c.get("device_index", 0), c["resolution"], c["hfov_deg"], c["vfov_deg"])
    raise ValueError(f"Unknown camera type {c['type']}")
