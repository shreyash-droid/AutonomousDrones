"""Export the trained YOLO11 model for edge hardware and benchmark it.

    python hardware/export_model.py --format ncnn       # Raspberry Pi 4/5 (recommended)
    python hardware/export_model.py --format onnx       # generic CPU / OpenCV DNN
    python hardware/export_model.py --format engine     # NVIDIA Jetson (run ON the Jetson)
    python hardware/export_model.py --benchmark-only    # just time the current model
"""

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ultralytics import YOLO

MODEL = ROOT / "models" / "best.pt"
SAMPLE = ROOT / "drone_data" / "images"


def benchmark(model_path, runs=10):
    model = YOLO(str(model_path), task="detect")
    images = sorted(SAMPLE.glob("*.jpg"))[:runs] or [ROOT / "test_images" / "field.jpg"]
    model.predict(str(images[0]), imgsz=640, verbose=False)          # warm-up
    t0 = time.perf_counter()
    for img in images:
        model.predict(str(img), imgsz=640, verbose=False)
    ms = (time.perf_counter() - t0) * 1000 / len(images)
    print(f"{Path(model_path).name}: {ms:.0f} ms / image  ({1000 / ms:.1f} FPS)")
    return ms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", default="ncnn", choices=["ncnn", "onnx", "engine", "tflite", "openvino"])
    ap.add_argument("--half", action="store_true", help="FP16 (engine / openvino)")
    ap.add_argument("--int8", action="store_true", help="INT8 quantisation (tflite / engine)")
    ap.add_argument("--benchmark-only", action="store_true")
    a = ap.parse_args()

    if a.benchmark_only:
        benchmark(MODEL)
        return
    model = YOLO(str(MODEL))
    out = model.export(format=a.format, imgsz=640, half=a.half, int8=a.int8)
    print(f"Exported -> {out}")
    print("Benchmark:")
    benchmark(MODEL)
    benchmark(out)
    print(f"\nSet detector.model_path in configs/drone_config.yaml to: {Path(out).relative_to(ROOT)}")


if __name__ == "__main__":
    main()
