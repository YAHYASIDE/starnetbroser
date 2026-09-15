# Build context is the repository root (see docker-compose.yml) so this
# can COPY backend/app/reader, the single source of truth for the
# text-extraction logic, instead of duplicating it.
#
# NOTE (read before deploying): this image could not be pulled/built inside
# the sandbox that produced this PR - its network policy blocks both Docker
# Hub blob downloads and Playwright's own Chromium CDN (see PR description,
# "What still needs verifying on a real server"). It must be built and
# smoke-tested on the target VPS per docs/DEPLOYMENT.md before go-live.
FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/reader ./reader_shared
COPY worker/control_server.py worker/status_probe.js worker/autofill.js worker/entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV DISPLAY=:99
# Control API (backend -> worker, internal only) and noVNC websocket
# (backend -> worker, internal only, proxied out through
# app/browser/routes.py:vnc_proxy). Neither is ever published to the host.
EXPOSE 7000 6080

ENTRYPOINT ["./entrypoint.sh"]
