#!/bin/sh
# Starts, in order: a virtual X display, the VNC server + noVNC bridge on
# that display, and the control API (which itself launches the persistent
# Chromium context, headful, onto the same display - see control_server.py).
# Nothing here is reachable outside this container except via the two
# internal-only ports (7000 control API, 6080 noVNC) - see Dockerfile.
set -e

mkdir -p /data/profile

Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp &
XVFB_PID=$!

# Give Xvfb a moment to actually create the display before anything tries
# to attach to it.
for i in $(seq 1 20); do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

# No RFB-level VNC password: this port is never reachable except from
# inside this container's network namespace. The real access control is
# (a) worker_network being internal-only (no host-published ports, see
# docker-compose.yml) and (b) the backend's one-time, 60-second ticket
# gating every WebSocket proxy connection (see
# app/browser/manager.py:issue_vnc_ticket and
# app/browser/routes.py:vnc_proxy). Adding a static VNC password on top
# would just be a second secret to manage for no real extra protection.
x11vnc -display "$DISPLAY" -forever -shared -noxdamage -nopw -rfbport 5900 -quiet &

websockify --web=/usr/share/novnc 6080 localhost:5900 &

uvicorn control_server:app --host 0.0.0.0 --port 7000 &
CONTROL_PID=$!

trap 'kill $XVFB_PID $CONTROL_PID 2>/dev/null' TERM INT
wait $CONTROL_PID
