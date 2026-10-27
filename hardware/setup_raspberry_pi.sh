#!/usr/bin/env bash
# =====================================================================
#  One-time setup of the Raspberry Pi 5 companion computer
#  (Raspberry Pi OS Bookworm 64-bit). Run from the project root:
#       bash hardware/setup_raspberry_pi.sh
# =====================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(whoami)"

echo "==> System packages"
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip python3-picamera2 python3-libcamera \
                        python3-gpiozero python3-opencv libopenblas-dev git

echo "==> Enable camera + hardware UART (Pixhawk TELEM2), disable serial console"
sudo raspi-config nonint do_camera 0 || true
sudo raspi-config nonint do_serial_hw 0      # enable UART hardware
sudo raspi-config nonint do_serial_cons 1    # disable login shell on serial
# Pi 5: primary UART on GPIO14/15 is /dev/ttyAMA0 -> /dev/serial0
grep -q "^dtparam=uart0=on" /boot/firmware/config.txt || echo "dtparam=uart0=on" | sudo tee -a /boot/firmware/config.txt
sudo usermod -a -G dialout,video,gpio "$USER_NAME"

echo "==> Python virtual environment (with system picamera2)"
python3 -m venv --system-site-packages "$PROJECT_DIR/.venv"
"$PROJECT_DIR/.venv/bin/pip" install --upgrade pip
"$PROJECT_DIR/.venv/bin/pip" install -r "$PROJECT_DIR/hardware/requirements-pi.txt"

echo "==> Export YOLO11 model to NCNN (fast on ARM CPUs)"
cd "$PROJECT_DIR"
"$PROJECT_DIR/.venv/bin/python" hardware/export_model.py --format ncnn
sed -i 's#model_path: models/best.pt#model_path: models/best_ncnn_model#' configs/drone_config.yaml
sed -i 's#^mode: sim#mode: hardware#' configs/drone_config.yaml

echo "==> Install systemd service (starts the mission software at boot)"
sed -e "s#__PROJECT_DIR__#$PROJECT_DIR#g" -e "s#__USER__#$USER_NAME#g" \
    "$PROJECT_DIR/hardware/weed-drone.service" | sudo tee /etc/systemd/system/weed-drone.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable weed-drone.service

cat <<EOF

Setup complete. Reboot now:  sudo reboot

After reboot:
  - check the Pixhawk link :  .venv/bin/python hardware/check_hardware.py
  - live logs              :  journalctl -u weed-drone -f
  - start manually         :  .venv/bin/python -m drone.main --mode hardware
EOF
