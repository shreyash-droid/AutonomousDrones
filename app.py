"""AI Weed Detection - analysis dashboard (Streamlit).

    streamlit run app.py

Tabs
  1. Detect        - run the YOLO11 model on an uploaded / sample drone image
  2. Batch report  - results of src/batch_detect.py (results/detections.csv)
  3. Flight logs   - weed map + summary of missions flown by drone/main.py
  4. Simulator     - how to launch the live web Ground Control Station
"""

import json
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import streamlit as st

from drone.config import load_config

ROOT = Path(__file__).resolve().parent
CFG = load_config()
SAMPLES = sorted((ROOT / "drone_data" / "images").glob("*.jpg"), key=lambda p: (len(p.stem), p.stem))
COLORS = {"weed": (60, 60, 255), "crop": (80, 200, 80)}   # BGR

st.set_page_config(page_title="AI Weed Detection", page_icon="🌱", layout="wide")


@st.cache_resource
def get_detector():
    from drone.detector import WeedDetector
    return WeedDetector(CFG["detector"])


def draw(frame, detections):
    out = frame.copy()
    for d in detections:
        c = COLORS.get(d.class_name, (255, 255, 0))
        p1, p2 = (int(d.x1), int(d.y1)), (int(d.x2), int(d.y2))
        cv2.rectangle(out, p1, p2, c, 2)
        cv2.putText(out, f"{d.class_name} {d.confidence:.2f}", (p1[0], max(12, p1[1] - 4)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, c, 1, cv2.LINE_AA)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


st.title("🌱 AI Weed Detection for Autonomous Drones")
st.caption("YOLO11 crop / weed detector · precision spot-spraying · Ground Control Station")

with st.sidebar:
    st.header("Model")
    conf = st.slider("Confidence threshold", 0.05, 0.9, float(CFG["detector"]["confidence"]), 0.05)
    st.write(f"Weights: `{CFG['detector']['model_path']}`")
    st.write("Classes: `crop`, `weed`")
    st.divider()
    st.markdown("**Run modes** (`python -m drone.main --mode ...`)\n\n"
                "- `sim`: full simulation\n- `sitl`: ArduPilot SITL\n- `hardware`: Pixhawk + Pi")

tab_detect, tab_batch, tab_logs, tab_sim = st.tabs(["🔍 Detect", "📊 Batch report", "🗺️ Flight logs", "🚁 Simulator"])

# ------------------------------------------------------------------ detect
with tab_detect:
    left, right = st.columns([1, 2])
    with left:
        upload = st.file_uploader("Upload a drone image", type=["jpg", "jpeg", "png", "bmp"])
        sample = st.selectbox("…or pick a sample from drone_data/images", SAMPLES, format_func=lambda p: p.name)
        altitude = st.number_input("Flight altitude (m) for size estimate", 1.0, 50.0, 10.0)
    if upload is not None:
        frame = cv2.imdecode(np.frombuffer(upload.read(), np.uint8), cv2.IMREAD_COLOR)
        name = upload.name
    else:
        frame = cv2.imread(str(sample))
        name = sample.name

    det = get_detector()
    det.confidence = conf
    detections, ms = det.detect(frame)
    weeds = [d for d in detections if det.is_weed(d)]
    crops = [d for d in detections if det.is_crop(d)]

    with left:
        a, b, c = st.columns(3)
        a.metric("Weeds", len(weeds))
        b.metric("Crops", len(crops))
        c.metric("Inference", f"{ms:.0f} ms")
        h, w = frame.shape[:2]
        from drone.geo import camera_footprint
        fw, fh = camera_footprint(altitude, CFG["camera"]["hfov_deg"], CFG["camera"]["vfov_deg"])
        weed_area = sum((d.x2 - d.x1) / w * fw * (d.y2 - d.y1) / h * fh for d in weeds)
        st.metric("Weed cover (est.)", f"{100 * weed_area / (fw * fh):.2f} %",
                  help="Share of the photographed ground covered by weed boxes")
    with right:
        st.image(draw(frame, detections), caption=name, width="stretch")
    if detections:
        df = pd.DataFrame([d.to_dict() for d in detections])
        st.dataframe(df, width="stretch", hide_index=True)
        st.download_button("Download detections CSV", df.to_csv(index=False), f"{Path(name).stem}_detections.csv")

# ------------------------------------------------------------------ batch
with tab_batch:
    csv_path = ROOT / "results" / "detections.csv"
    if not csv_path.exists():
        st.info("Run `python src/batch_detect.py` to create results/detections.csv")
    else:
        df = pd.read_csv(csv_path)
        a, b, c = st.columns(3)
        a.metric("Images", df["image_name"].nunique())
        b.metric("Weeds", int((df["class_name"] == "weed").sum()))
        c.metric("Crops", int((df["class_name"] != "weed").sum()))
        counts = df.pivot_table(index="image_name", columns="class_name", values="confidence",
                                aggfunc="count", fill_value=0)
        st.bar_chart(counts)
        st.dataframe(df, width="stretch", hide_index=True)
        ann = sorted((ROOT / "results" / "annotated").glob("*.jpg"), key=lambda p: (len(p.stem), p.stem))
        if ann:
            st.subheader("Annotated images")
            cols = st.columns(4)
            for i, p in enumerate(ann):
                cols[i % 4].image(str(p), caption=p.name, width="stretch")

# ------------------------------------------------------------------ logs
with tab_logs:
    wm = ROOT / "logs" / "weed_map.csv"
    flights = sorted((ROOT / "logs").glob("flight_*.jsonl"))
    if not wm.exists():
        st.info("Fly a mission first: `python -m drone.main --mode sim` or use the web simulator.")
    else:
        df = pd.read_csv(wm)
        summary = None
        if flights:
            for line in flights[-1].read_text(encoding="utf-8").splitlines()[::-1]:
                ev = json.loads(line)
                if ev.get("type") == "mission" and ev.get("summary"):
                    summary = ev["summary"]
                    break
        if summary:
            cols = st.columns(6)
            for col, (k, label) in zip(cols, [("weeds", "Weeds"), ("weeds_sprayed", "Sprayed"),
                                               ("herbicide_ml", "Herbicide ml"), ("savings_pct", "Saved %"),
                                               ("flight_time_s", "Flight s"), ("distance_m", "Distance m")]):
                col.metric(label, summary[k])
        df["color"] = df["class"].map({"weed": "#e53935", "crop": "#43a047"})
        st.map(df.rename(columns={"lat": "latitude", "lon": "longitude"}), color="color", size=0.3, zoom=19)
        st.dataframe(df.drop(columns="color"), width="stretch", hide_index=True)
        c1, c2, c3 = st.columns(3)
        c1.download_button("weed_map.csv", wm.read_bytes(), "weed_map.csv")
        for col, ext in ((c2, "geojson"), (c3, "kml")):
            f = ROOT / "logs" / f"weed_map.{ext}"
            if f.exists():
                col.download_button(f.name, f.read_bytes(), f.name)

# ------------------------------------------------------------------ simulator
with tab_sim:
    st.markdown("""
### Live web simulation / Ground Control Station
```bash
python simulation/server.py
```
Open **http://localhost:8000**. The page runs the *real* onboard mission code
(`drone/mission.py`) and the YOLO11 model, with a simulated Pixhawk, camera and sprayer.

* **Offline:** open `simulation/web/index.html` directly. It replays a recorded mission.
* **Hardware:** the Raspberry Pi streams telemetry to `ws://<laptop>:8000/ws/drone` and the
  same page becomes the live ground station.
""")
