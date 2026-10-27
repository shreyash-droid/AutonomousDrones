"""Checks the trained YOLO11 model through the onboard detector wrapper."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from drone.config import load_config

MODEL = ROOT / "models" / "best.pt"


@unittest.skipUnless(MODEL.exists(), "models/best.pt not present")
class DetectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import cv2
        from drone.detector import WeedDetector
        cls.det = WeedDetector(load_config()["detector"])
        cls.frame = cv2.imread(str(ROOT / "drone_data" / "images" / "image1.jpg"))

    def test_classes(self):
        self.assertTrue({"crop", "weed"} <= set(self.det.model.names.values()))   # merged model adds "panicle"

    def test_detects_weeds(self):
        dets, ms = self.det.detect(self.frame)
        weeds = [d for d in dets if self.det.is_weed(d)]
        self.assertGreaterEqual(len(weeds), 5)
        for d in dets:
            self.assertTrue(0 <= d.x1 < d.x2 <= self.frame.shape[1])
            self.assertGreaterEqual(d.confidence, self.det.confidence)


if __name__ == "__main__":
    unittest.main()
