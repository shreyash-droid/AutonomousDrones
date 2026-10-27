"""YOLO11 weed/crop detector wrapper.

Works with every format Ultralytics can load, so the same code runs the
PyTorch model on a laptop (models/best.pt), NCNN on a Raspberry Pi
(models/best_ncnn_model) or TensorRT on a Jetson (models/best.engine).
"""

import threading
import time
from dataclasses import dataclass, asdict

from drone.config import resolve_path


@dataclass
class Detection:
    class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def center(self):
        return (self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2

    def to_dict(self):
        d = asdict(self)
        d["confidence"] = round(self.confidence, 4)
        for k in ("x1", "y1", "x2", "y2"):
            d[k] = round(d[k], 1)
        return d


class WeedDetector:
    def __init__(self, cfg):
        from ultralytics import YOLO  # imported lazily: heavy

        self.cfg = cfg
        model_path = resolve_path(cfg["model_path"])
        if not model_path.exists():
            raise FileNotFoundError(f"Model missing: {model_path}")
        self.model = YOLO(str(model_path), task="detect")
        self.confidence = float(cfg.get("confidence", 0.25))
        self.iou = float(cfg.get("iou", 0.7))
        self.image_size = int(cfg.get("image_size", 640))
        self.device = cfg.get("device", "cpu")
        self.weed_classes = set(cfg.get("weed_classes", ["weed"]))
        self.crop_classes = set(cfg.get("crop_classes", ["crop"]))
        self._lock = threading.Lock()   # shared by the mission thread and the web API

    def warmup(self):
        import numpy as np
        self.detect(np.zeros((self.image_size, self.image_size, 3), dtype="uint8"))

    def detect(self, frame):
        """frame: BGR numpy array (OpenCV convention) or image path.

        Returns (detections, inference_ms).
        """
        return self.detect_with(frame, self.confidence)

    def detect_with(self, frame, confidence):
        t0 = time.perf_counter()
        with self._lock:
            result = self.model.predict(
                source=frame,
                conf=confidence,
                iou=self.iou,
                imgsz=self.image_size,
                device=self.device,
                verbose=False,
            )[0]
        ms = (time.perf_counter() - t0) * 1000.0
        detections = []
        for box in result.boxes:
            cls_name = result.names[int(box.cls.item())]
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append(Detection(cls_name, float(box.conf.item()), x1, y1, x2, y2))
        return detections, ms

    def is_weed(self, det):
        return det.class_name in self.weed_classes

    def is_crop(self, det):
        return det.class_name in self.crop_classes
