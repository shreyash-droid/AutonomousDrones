# AgriDrone AI: Next.js dashboard

This folder holds the project landing page and the analysis dashboard. It replaces the
Streamlit app (`app.py`) with a production-grade web front end.

| Route | What it shows |
|---|---|
| `/` | Project landing page: animated mission, how it works, live AI showcase, hardware architecture, impact, run modes |
| `/dashboard` | Overview: system status, model info, latest mission KPIs |
| `/dashboard/detect` | Upload or pick a drone image and run YOLO11 live (confidence and altitude controls, hover boxes, CSV export) |
| `/dashboard/batch` | Batch report: detections per image, confidence distribution, annotated gallery |
| `/dashboard/flights` | Flight logs: mission reports and the georeferenced GPS weed map (GeoJSON/CSV export) |
| `/dashboard/simulator` | The live Ground Control Station, embedded |

## Run

```bash
# terminal 1 - Python AI backend (project root)
python simulation/server.py

# terminal 2 - dashboard
cd dashboard
npm install        # first time only
npm run dev        # http://localhost:3000
```

The landing page works on its own. The dashboard pages call the Python backend through the
`/backend/*` proxy (see `next.config.ts`). If the backend is not running, they show a
clear "start the backend" message.

Use `BACKEND_URL` to point the dashboard at a backend on another machine:

```bash
BACKEND_URL=http://192.168.1.10:8000 NEXT_PUBLIC_GCS_URL=http://192.168.1.10:8000 npm run dev
```

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS v4 · Framer Motion · Recharts · lucide icons.

The weed and crop chart colours (`#ee5f4c` and `#20a7a0`) were checked for colour-vision
deficiency against the dark surface.

`scripts/build_showcase.py` regenerates the real detection examples shown on the landing page.
