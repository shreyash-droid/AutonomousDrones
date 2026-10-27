"""Onboard software for the autonomous weed detection & spot-spraying drone.

Runs on the companion computer (Raspberry Pi 5 / Jetson Orin Nano) that sits
next to the Pixhawk flight controller. Every hardware dependency is hidden
behind a small interface (FlightController, Camera, Sprayer) with a real
driver and a simulated driver, so the exact same mission logic runs in the
web simulator, in ArduPilot SITL and on the real aircraft.
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
