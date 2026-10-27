
from pathlib import Path
from ultralytics import YOLO

model = YOLO("models/best.pt")

image_path = Path("test_images/field.jpg")

if not image_path.exists():
    raise FileNotFoundError(
        f"Image not found: {image_path.resolve()}"
    )

results = model.predict(
    source=str(image_path),
    conf=0.25,       # Confidence threshold
    imgsz=640,       # Original training resolution
    iou=0.7,         # NMS IoU threshold
    max_det=300,
    save=True,
    project="results",
    name="predictions",
    exist_ok=True,
    verbose=False
)

for result in results:
    print("Image:", result.path)
    print("Detections:", len(result.boxes))

    for box in result.boxes:
        class_id = int(box.cls.item())
        confidence = float(box.conf.item())

        print(
            f"Class: {result.names[class_id]}, "
            f"Confidence: {confidence:.2f}"
        )

print("Annotated image saved in results/predictions/")
