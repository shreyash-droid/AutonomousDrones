"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Maximize2, RefreshCw } from "lucide-react";
import { BackendOffline, Loading, PageHeader } from "@/components/dashboard/ui";
import { api, GCS_URL } from "@/lib/api";

export default function SimulatorPage() {
  const [state, setState] = useState<"checking" | "online" | "offline">("checking");
  const [key, setKey] = useState(0);

  const check = useCallback(() => {
    setState("checking");
    api.info().then(() => setState("online")).catch(() => setState("offline"));
  }, []);
  useEffect(check, [check]);

  return (
    <>
      <PageHeader
        eyebrow="Live simulator"
        title="Ground Control Station"
        desc="This runs the real onboard mission software with a simulated Pixhawk, camera and sprayer. The YOLO11 model analyses every photo live. Press Start mission inside the console."
        actions={state === "online" && (
          <>
            <button className="btn btn-ghost" onClick={() => setKey((k) => k + 1)}><RefreshCw className="h-4 w-4" /> Reload</button>
            <a className="btn btn-primary" href={GCS_URL} target="_blank" rel="noreferrer">
              <Maximize2 className="h-4 w-4" /> Full screen <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      />
      {state === "checking" && <Loading label="Connecting to the simulator" />}
      {state === "offline" && (
        <>
          <BackendOffline onRetry={check} />
          <p className="mt-4 text-center text-sm text-muted">
            No Python available? Open <code className="font-mono text-ink-2">simulation/web/index.html</code> directly
            in a browser to replay a recorded mission.
          </p>
        </>
      )}
      {state === "online" && (
        <div className="card overflow-hidden p-1.5">
          <iframe key={key} src={GCS_URL} title="AgriDrone Ground Control Station"
                  className="block h-[calc(100vh-220px)] min-h-[640px] w-full rounded-xl bg-bg" />
        </div>
      )}
    </>
  );
}
