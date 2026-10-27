"""Flight-controller abstraction.

MavlinkFlightController  -> real Pixhawk (ArduCopter 4.x) or ArduPilot SITL
SimFlightController      -> lightweight kinematic model for the web simulator

Both expose the same methods, so drone/mission.py never knows which one it
is flying.
"""

import math
import random
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict

from drone import geo


@dataclass
class VehicleState:
    lat: float = 0.0
    lon: float = 0.0
    alt: float = 0.0              # metres above home
    heading: float = 0.0          # degrees, 0 = North
    groundspeed: float = 0.0      # m/s
    climb: float = 0.0            # m/s
    battery_pct: float = 100.0
    voltage: float = 0.0
    mode: str = "UNKNOWN"
    armed: bool = False
    gps_fix: int = 0              # 0-1 none, 2 = 2D, 3 = 3D, 4+ DGPS/RTK
    satellites: int = 0

    def to_dict(self):
        return asdict(self)


class FlightController(ABC):
    @abstractmethod
    def connect(self): ...

    @abstractmethod
    def close(self): ...

    @abstractmethod
    def state(self) -> VehicleState: ...

    @abstractmethod
    def set_mode(self, mode): ...

    @abstractmethod
    def arm(self): ...

    @abstractmethod
    def takeoff(self, altitude_m): ...

    @abstractmethod
    def goto(self, lat, lon, alt): ...

    @abstractmethod
    def set_speed(self, speed_m_s): ...

    def hold(self):
        """Stop and hover at the current position (stays in GUIDED)."""
        s = self.state()
        self.goto(s.lat, s.lon, s.alt)

    def rtl(self):
        self.set_mode("RTL")

    def land(self):
        self.set_mode("LAND")


# =====================================================================
#  Real hardware / SITL - MAVLink
# =====================================================================
class MavlinkFlightController(FlightController):
    """Talks MAVLink 2 to ArduCopter running on a Pixhawk (or SITL).

    Wiring: Pixhawk TELEM2  <->  Raspberry Pi GPIO14/15 (/dev/serial0)
    ArduPilot params: SERIAL2_PROTOCOL=2, SERIAL2_BAUD=921 (see hardware/).
    """

    STREAMS_HZ = {  # message id -> rate
        33: 10,   # GLOBAL_POSITION_INT
        1: 2,     # SYS_STATUS
        24: 2,    # GPS_RAW_INT
        74: 5,    # VFR_HUD
    }

    def __init__(self, connection, baud=921600, heartbeat_timeout_s=30):
        self.connection = connection
        self.baud = baud
        self.heartbeat_timeout_s = heartbeat_timeout_s
        self.master = None
        self._state = VehicleState()
        self._lock = threading.Lock()
        self._running = False
        self._reader = None

    # -------------------------------------------------------------- link
    def connect(self):
        from pymavlink import mavutil
        self.mavutil = mavutil
        self.master = mavutil.mavlink_connection(
            self.connection,
            baud=self.baud,
            source_system=1,
            source_component=mavutil.mavlink.MAV_COMP_ID_ONBOARD_COMPUTER,
        )
        hb = self.master.wait_heartbeat(timeout=self.heartbeat_timeout_s)
        if hb is None:
            raise TimeoutError(f"No heartbeat from flight controller on {self.connection}")
        for msg_id, hz in self.STREAMS_HZ.items():
            self._command(mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL, msg_id, int(1e6 / hz))
        self._running = True
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        # wait for the first position fix message
        t0 = time.time()
        while self._state.lat == 0 and time.time() - t0 < 10:
            time.sleep(0.1)

    def close(self):
        self._running = False
        if self.master:
            self.master.close()

    def _command(self, command, p1=0, p2=0, p3=0, p4=0, p5=0, p6=0, p7=0):
        self.master.mav.command_long_send(
            self.master.target_system, self.master.target_component,
            command, 0, p1, p2, p3, p4, p5, p6, p7)

    def _read_loop(self):
        while self._running:
            msg = self.master.recv_match(blocking=True, timeout=1)
            if msg is None:
                continue
            t = msg.get_type()
            with self._lock:
                s = self._state
                if t == "GLOBAL_POSITION_INT":
                    s.lat = msg.lat / 1e7
                    s.lon = msg.lon / 1e7
                    s.alt = msg.relative_alt / 1000.0
                    if msg.hdg != 65535:
                        s.heading = msg.hdg / 100.0
                    s.groundspeed = math.hypot(msg.vx, msg.vy) / 100.0
                    s.climb = -msg.vz / 100.0
                elif t == "SYS_STATUS":
                    if msg.battery_remaining >= 0:
                        s.battery_pct = float(msg.battery_remaining)
                    s.voltage = msg.voltage_battery / 1000.0
                elif t == "GPS_RAW_INT":
                    s.gps_fix = msg.fix_type
                    s.satellites = msg.satellites_visible
                elif t == "HEARTBEAT" and msg.get_srcComponent() == 1:
                    s.mode = self.master.flightmode
                    s.armed = bool(msg.base_mode & self.mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)

    # -------------------------------------------------------------- API
    def state(self):
        with self._lock:
            return VehicleState(**asdict(self._state))

    def set_mode(self, mode):
        mapping = self.master.mode_mapping()
        if mode not in mapping:
            raise ValueError(f"Unknown flight mode {mode}")
        self.master.set_mode(mapping[mode])
        t0 = time.time()
        while self.state().mode != mode and time.time() - t0 < 5:
            time.sleep(0.1)

    def arm(self, timeout_s=60):
        """Retry arming while the EKF / GPS settle (pre-arm checks)."""
        t0 = time.time()
        while not self.state().armed:
            if time.time() - t0 > timeout_s:
                raise RuntimeError("Arming failed - check pre-arm messages in the GCS")
            self.master.arducopter_arm()
            for _ in range(20):
                if self.state().armed:
                    return
                time.sleep(0.1)

    def takeoff(self, altitude_m):
        self._command(self.mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, p7=altitude_m)

    def goto(self, lat, lon, alt):
        m = self.mavutil.mavlink
        self.master.mav.set_position_target_global_int_send(
            0, self.master.target_system, self.master.target_component,
            m.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
            0b110111111000,                    # use position only
            int(lat * 1e7), int(lon * 1e7), alt,
            0, 0, 0, 0, 0, 0, 0, 0)

    def set_speed(self, speed_m_s):
        self._command(self.mavutil.mavlink.MAV_CMD_DO_CHANGE_SPEED, 1, speed_m_s, -1)

    def set_relay(self, relay, on):
        """Used by MavlinkSprayer: Pixhawk RELAY output drives the pump MOSFET."""
        self._command(self.mavutil.mavlink.MAV_CMD_DO_SET_RELAY, relay, 1 if on else 0)


# =====================================================================
#  Simulation
# =====================================================================
class SimFlightController(FlightController):
    """Kinematic quadcopter model that mimics ArduCopter GUIDED/RTL/LAND."""

    CLIMB_RATE = 2.0
    DESCENT_RATE = 1.5
    LAND_RATE = 0.8
    ACCEL = 2.5

    def __init__(self, clock, home_lat, home_lon, start_battery=100.0,
                 drain_pct_per_min=3.5, gps_noise_m=0.0, rtl_alt=12.0):
        self.clock = clock
        self.home_lat, self.home_lon = home_lat, home_lon
        self.x = self.y = self.alt = 0.0
        self.vx = self.vy = self.vz = 0.0
        self.target = None
        self.mode = "STABILIZE"
        self.armed = False
        self.speed = 3.0
        self.battery = float(start_battery)
        self.drain = drain_pct_per_min / 60.0
        self.gps_noise = gps_noise_m
        self.rtl_alt = rtl_alt
        self._rtl_phase = None
        self._last = None
        self._lock = threading.Lock()

    def connect(self):
        self._last = self.clock.now()

    def close(self):
        pass

    # ---------------------------------------------------------- physics
    def _update(self):
        now = self.clock.now()
        dt_total = now - self._last
        self._last = now
        while dt_total > 1e-6:
            dt = min(0.05, dt_total)
            dt_total -= dt
            self._step(dt)

    def _step(self, dt):
        if not self.armed:
            self.vx = self.vy = self.vz = 0.0
            return
        self.battery = max(0.0, self.battery - self.drain * dt)

        tx, ty, talt = self._current_target()
        dx, dy = tx - self.x, ty - self.y
        dist = math.hypot(dx, dy)
        # horizontal: accelerate towards target, slow down near it
        if dist > 1e-3:
            v_des = min(self.speed, math.sqrt(2 * self.ACCEL * dist))
            vx_des, vy_des = dx / dist * v_des, dy / dist * v_des
        else:
            vx_des = vy_des = 0.0
        dvx, dvy = vx_des - self.vx, vy_des - self.vy
        dv = math.hypot(dvx, dvy)
        max_dv = self.ACCEL * 2 * dt
        if dv > max_dv:
            dvx, dvy = dvx / dv * max_dv, dvy / dv * max_dv
        self.vx += dvx
        self.vy += dvy
        step = math.hypot(self.vx, self.vy) * dt
        if step >= dist:
            self.x, self.y = tx, ty
            self.vx = self.vy = 0.0
        else:
            self.x += self.vx * dt
            self.y += self.vy * dt

        # vertical
        dz = talt - self.alt
        rate = self.CLIMB_RATE if dz > 0 else (self.LAND_RATE if self.mode == "LAND" else self.DESCENT_RATE)
        self.vz = math.copysign(min(rate, abs(dz) / max(dt, 1e-6)), dz) if abs(dz) > 1e-3 else 0.0
        self.alt += self.vz * dt
        self.alt = max(0.0, self.alt)

        # RTL state machine: climb -> fly home -> land
        if self.mode == "RTL":
            if self._rtl_phase == "climb" and self.alt >= self.rtl_alt - 0.1:
                self._rtl_phase = "return"
            elif self._rtl_phase == "return" and math.hypot(self.x, self.y) < 0.3:
                self.mode = "LAND"
        if self.mode == "LAND" and self.alt <= 0.02:
            self.alt = 0.0
            self.armed = False          # ArduPilot auto-disarms after landing
            self.mode = "LAND"

    def _current_target(self):
        if self.mode == "LAND":
            return self.x, self.y, 0.0
        if self.mode == "RTL":
            if self._rtl_phase == "climb":
                return self.x, self.y, max(self.rtl_alt, self.alt)
            return 0.0, 0.0, max(self.rtl_alt, self.alt)
        if self.target is None:
            return self.x, self.y, self.alt
        return self.target

    # -------------------------------------------------------------- API
    def state(self):
        with self._lock:
            self._update()
            nx = random.gauss(0, self.gps_noise) if self.gps_noise else 0.0
            ny = random.gauss(0, self.gps_noise) if self.gps_noise else 0.0
            lat, lon = geo.offset_to_latlon(self.home_lat, self.home_lon, self.x + nx, self.y + ny)
            return VehicleState(
                lat=lat, lon=lon, alt=self.alt, heading=0.0,
                groundspeed=math.hypot(self.vx, self.vy), climb=self.vz,
                battery_pct=self.battery, voltage=14.0 + 2.8 * self.battery / 100.0,
                mode=self.mode, armed=self.armed, gps_fix=3, satellites=14)

    def set_mode(self, mode):
        with self._lock:
            self._update()
            self.mode = mode
            if mode == "RTL":
                self._rtl_phase = "climb"
            if mode == "GUIDED" and self.target is None:
                self.target = (self.x, self.y, self.alt)

    def arm(self):
        with self._lock:
            self._update()
            if self.battery < 10:
                raise RuntimeError("PreArm: battery too low")
            self.armed = True

    def takeoff(self, altitude_m):
        with self._lock:
            self._update()
            self.target = (self.x, self.y, altitude_m)

    def goto(self, lat, lon, alt):
        x, y = geo.latlon_to_offset(self.home_lat, self.home_lon, lat, lon)
        with self._lock:
            self._update()
            self.target = (x, y, alt)

    def set_speed(self, speed_m_s):
        self.speed = float(speed_m_s)

    def hold(self):
        with self._lock:
            self._update()
            self.target = (self.x, self.y, self.alt)

    def true_position(self):
        """Ground-truth position (no GPS noise) - used by the simulated camera."""
        with self._lock:
            self._update()
            return self.x, self.y, self.alt
