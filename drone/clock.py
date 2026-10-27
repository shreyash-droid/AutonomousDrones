"""Time source shared by the mission and the drivers.

On the aircraft this is wall-clock time. In simulation the clock can run
faster than real time so a 10 minute mission can be demonstrated in ~2 min.
"""

import threading
import time


class RealClock:
    speedup = 1.0

    def now(self):
        return time.monotonic()

    def sleep(self, seconds):
        time.sleep(max(0.0, seconds))


class SimClock:
    """Simulated time = accumulated real time x speedup (changeable live)."""

    def __init__(self, speedup=1.0):
        self._lock = threading.Lock()
        self._speedup = float(speedup)
        self._sim_t = 0.0
        self._last_real = time.monotonic()

    def _advance(self):
        real = time.monotonic()
        self._sim_t += (real - self._last_real) * self._speedup
        self._last_real = real

    @property
    def speedup(self):
        return self._speedup

    @speedup.setter
    def speedup(self, value):
        with self._lock:
            self._advance()
            self._speedup = max(0.1, float(value))

    def now(self):
        with self._lock:
            self._advance()
            return self._sim_t

    def sleep(self, sim_seconds):
        time.sleep(max(0.0, sim_seconds) / self._speedup)
