"""Spot-sprayer drivers.

SerialSprayer  -> Arduino Nano running firmware/sprayer_controller (recommended)
GpioSprayer    -> relay / MOSFET on a Raspberry Pi GPIO pin
MavlinkSprayer -> Pixhawk RELAY output (no extra micro-controller)
SimSprayer     -> virtual tank for the simulator

Serial protocol (115200 baud, newline terminated) - see firmware/README.md:
    PING            -> PONG
    ARM / DISARM    -> OK ARMED / OK DISARMED
    SPRAY <ms>      -> OK SPRAY <ms>  ... DONE <ml_dispensed>
    STOP            -> OK STOP
    STATUS          -> STATUS armed=1 pump=0 tank_ml=1834 total_ml=166 rc_kill=0
"""

import threading
import time
from abc import ABC, abstractmethod


class Sprayer(ABC):
    def __init__(self, tank_capacity_ml, flow_rate_ml_s):
        self.capacity = float(tank_capacity_ml)
        self.tank_ml = float(tank_capacity_ml)
        self.flow = float(flow_rate_ml_s)
        self.total_ml = 0.0
        self.spray_count = 0

    def open(self):
        pass

    def close(self):
        pass

    def arm(self):
        pass

    def disarm(self):
        pass

    def ping(self):
        return True

    @property
    def tank_pct(self):
        return 100.0 * self.tank_ml / self.capacity if self.capacity else 0.0

    @property
    def empty(self):
        return self.tank_ml <= 1.0

    def _account(self, duration_ms):
        ml = min(self.tank_ml, self.flow * duration_ms / 1000.0)
        self.tank_ml -= ml
        self.total_ml += ml
        self.spray_count += 1
        return ml

    @abstractmethod
    def spray(self, duration_ms):
        """Blocking: open the valve for duration_ms. Returns ml dispensed."""


class SimSprayer(Sprayer):
    def __init__(self, clock, tank_capacity_ml, flow_rate_ml_s):
        super().__init__(tank_capacity_ml, flow_rate_ml_s)
        self.clock = clock

    def spray(self, duration_ms):
        if self.empty:
            return 0.0
        self.clock.sleep(duration_ms / 1000.0)
        return self._account(duration_ms)


class SerialSprayer(Sprayer):
    def __init__(self, port, baud, tank_capacity_ml, flow_rate_ml_s):
        super().__init__(tank_capacity_ml, flow_rate_ml_s)
        self.port, self.baud = port, baud
        self.ser = None
        self._lock = threading.Lock()
        self._hb = None
        self._running = False

    def open(self):
        import serial
        self.ser = serial.Serial(self.port, self.baud, timeout=1)
        time.sleep(2.0)                 # Arduino resets when the port opens
        self.ser.reset_input_buffer()
        if not self.ping():
            raise RuntimeError(f"Sprayer controller not responding on {self.port}")
        # heartbeat: firmware shuts the pump if it hears nothing for 1.5 s
        self._running = True
        self._hb = threading.Thread(target=self._heartbeat, daemon=True)
        self._hb.start()

    def _heartbeat(self):
        while self._running:
            try:
                self._send("PING")
            except Exception:
                pass
            time.sleep(0.5)

    def _send(self, line, expect=None, timeout=1.0):
        with self._lock:
            self.ser.write((line + "\n").encode("ascii"))
            deadline = time.time() + timeout
            while time.time() < deadline:
                reply = self.ser.readline().decode("ascii", "ignore").strip()
                if not reply:
                    continue
                if expect is None or reply.startswith(expect) or reply.startswith("ERR"):
                    return reply
            return None

    def ping(self):
        return self._send("PING", "PONG") is not None

    def arm(self):
        self._send("ARM", "OK ARMED")

    def disarm(self):
        self._send("DISARM", "OK DISARMED")

    def spray(self, duration_ms):
        if self.empty:
            return 0.0
        timeout = duration_ms / 1000.0 + 1.5
        reply = self._send(f"SPRAY {int(duration_ms)}", "DONE", timeout=timeout)
        if reply is None:
            self._send("STOP")
            raise RuntimeError("Sprayer did not confirm spray")
        if reply.startswith("ERR"):
            if "TANK_EMPTY" in reply:
                self.tank_ml = 0.0
            print(f"[sprayer] refused: {reply}")
            return 0.0
        ml = self._account(duration_ms)
        try:   # trust the flow sensor when it reports a volume
            measured = float(reply.split()[1])
            if measured > 0:
                self.tank_ml += ml - measured
                self.total_ml += measured - ml
                ml = measured
        except (IndexError, ValueError):
            pass
        return ml

    def close(self):
        self._running = False
        if self.ser:
            self._send("STOP")
            self._send("DISARM")
            self.ser.close()


class GpioSprayer(Sprayer):
    def __init__(self, pin, tank_capacity_ml, flow_rate_ml_s):
        super().__init__(tank_capacity_ml, flow_rate_ml_s)
        self.pin = pin
        self.relay = None

    def open(self):
        from gpiozero import OutputDevice
        self.relay = OutputDevice(self.pin, active_high=True, initial_value=False)

    def spray(self, duration_ms):
        if self.empty:
            return 0.0
        self.relay.on()
        try:
            time.sleep(duration_ms / 1000.0)
        finally:
            self.relay.off()
        return self._account(duration_ms)

    def close(self):
        if self.relay:
            self.relay.off()
            self.relay.close()


class MavlinkSprayer(Sprayer):
    def __init__(self, flight_controller, relay, tank_capacity_ml, flow_rate_ml_s):
        super().__init__(tank_capacity_ml, flow_rate_ml_s)
        self.fc = flight_controller
        self.relay = relay

    def spray(self, duration_ms):
        if self.empty:
            return 0.0
        self.fc.set_relay(self.relay, True)
        try:
            time.sleep(duration_ms / 1000.0)
        finally:
            self.fc.set_relay(self.relay, False)
        return self._account(duration_ms)


def build_sprayer(cfg, flight_controller=None):
    s = cfg["sprayer"]
    cap, flow = s["tank_capacity_ml"], s["flow_rate_ml_s"]
    if s["type"] == "serial":
        return SerialSprayer(s["port"], s["baud"], cap, flow)
    if s["type"] == "gpio":
        return GpioSprayer(s["gpio_pin"], cap, flow)
    if s["type"] == "mavlink":
        return MavlinkSprayer(flight_controller, s["mavlink_relay"], cap, flow)
    raise ValueError(f"Unknown sprayer type {s['type']}")
