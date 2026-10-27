
from pathlib import Path
import csv

from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parent.parent

MODEL_PATH = PROJECT_ROOT / "models" / "best.pt"
IMAGE_DIR = PROJECT_ROOT / "drone_data" / "images"
OUTPUT_DIR = PROJECT_ROOT / "results" / "annotated"
CSV_PATH = PROJECT_ROOT / "results" / "detections.csv"

CONFIDENCE = 0.25
IMAGE_SIZE = 640

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp"}

def main():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model missing: {MODEL_PATH}")

    if not IMAGE_DIR.exists():
        raise FileNotFoundError(f"Image folder missing: {IMAGE_DIR}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

    images = sorted(
        p for p in IMAGE_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not images:
        print(f"No images found in {IMAGE_DIR}")
        return

    model = YOLO(str(MODEL_PATH))
    total_detections = 0

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "image_name",
            "class_name",
            "confidence",
            "x1",
            "y1",
            "x2",
            "y2"
        ])

        for index, image_path in enumerate(images, start=1):
            result = model.predict(
                source=str(image_path),
                conf=CONFIDENCE,
                imgsz=IMAGE_SIZE,
                verbose=False
            )[0]

            output_path = OUTPUT_DIR / image_path.name
            result.save(filename=str(output_path))

            count = len(result.boxes)
            total_detections += count

            for box in result.boxes:
                class_id = int(box.cls.item())
                class_name = result.names[class_id]
                confidence = float(box.conf.item())
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                writer.writerow([
                    image_path.name,
                    class_name,
                    round(confidence, 4),
                    round(x1, 2),
                    round(y1, 2),
                    round(x2, 2),
                    round(y2, 2)
                ])

            print(
                f"[{index}/{len(images)}] "
                f"{image_path.name}: {count} detections"
            )

    print("\nBatch processing complete.")
    print("Images processed:", len(images))
    print("Total detections:", total_detections)
    print("Annotated images:", OUTPUT_DIR)
    print("CSV report:", CSV_PATH)

if __name__ == "__main__":
    main()
