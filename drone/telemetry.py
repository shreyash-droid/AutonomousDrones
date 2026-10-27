"""Telemetry publishers - how the drone talks to the Ground Control Station.

Every event is a small JSON dict with a "type" field (telemetry, detections,
spray, log, mission, ...). The same events are:
  * written to a JSONL "black box" flight log on the SD card,
  * streamed to the web GCS (in-process in simulation, WebSocket on hardware).
"""

import json
import queue
import threading
import time
from datetime import datetime
from pathlib import Path


class Publisher:
    def publish(self, event):
        raise NotImplementedError

    def close(self):
        pass


class MultiPublisher(Publisher):
    def __init__(self, *publishers):
        self.publishers = [p for p in publishers if p is not None]

    def publish(self, event):
        for p in self.publishers:
            try:
                p.publish(event)
            except Exception as exc:     # telemetry must never crash the mission
                print(f"[telemetry] {type(p).__name__}: {exc}")

    def close(self):
        for p in self.publishers:
            p.close()


class CallbackPublisher(Publisher):
    def __init__(self, callback):
        self.callback = callback

    def publish(self, event):
        self.callback(event)


class ConsolePublisher(Publisher):
    """Prints logs and important events; skips the high-rate telemetry."""

    def publish(self, event):
        t = event.get("type")
        if t == "log":
            print(f"[{event.get('level', 'info').upper():5}] {event['msg']}")
        elif t == "mission":
            print(f"[MISSION] {event.get('state')}")


class JsonlLogger(Publisher):
    def __init__(self, log_dir):
        log_dir = Path(log_dir)
        log_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.path = log_dir / f"flight_{stamp}.jsonl"
        self._f = self.path.open("w", encoding="utf-8")
        self._lock = threading.Lock()

    def publish(self, event):
        with self._lock:
            self._f.write(json.dumps(event, separators=(",", ":")) + "\n")
            self._f.flush()

    def close(self):
        with self._lock:
            self._f.close()


class WebSocketPublisher(Publisher):
    """Streams events from the drone to simulation/server.py (/ws/drone).

    Runs in a background thread with a bounded queue and auto-reconnect, so a
    weak telemetry link (Wi-Fi / 4G) never blocks the flight loop.
    """

    def __init__(self, url, max_queue=500):
        self.url = url
        self.q = queue.Queue(maxsize=max_queue)
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def publish(self, event):
        try:
            self.q.put_nowait(event)
        except queue.Full:
            if event.get("type") != "telemetry":   # drop telemetry first
                try:
                    self.q.get_nowait()
                    self.q.put_nowait(event)
                except queue.Empty:
                    pass

    def _run(self):
        from websockets.sync.client import connect
        while self._running:
            try:
                with connect(self.url, open_timeout=5) as ws:
                    print(f"[telemetry] connected to GCS {self.url}")
                    while self._running:
                        try:
                            event = self.q.get(timeout=0.5)
                        except queue.Empty:
                            continue
                        ws.send(json.dumps(event))
            except Exception as exc:
                print(f"[telemetry] GCS link down ({exc}); retrying in 3 s")
                time.sleep(3)

    def close(self):
        time.sleep(0.5)          # let the last events flush
        self._running = False
