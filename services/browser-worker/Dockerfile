# Production image for the browser worker: Node + a real Chromium +
# Xvfb/x11vnc/websockify for the VNC view. One worker manages many
# accounts' browsers itself (not one container per account - see
# docs/ARCHITECTURE.md "Why one worker process manages many profiles"),
# so it needs the Docker socket and the Docker volumes directory bind-
# mounted in (to create/read each account's own named volume) and must
# NEVER publish its ports - see infra/docker-compose.yml.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY services/browser-worker/package.json services/browser-worker/
COPY packages/shared packages/shared
COPY services/browser-worker services/browser-worker
RUN npm ci --workspace=@starnet/shared --workspace=@starnet/browser-worker \
    && npm run build --workspace=@starnet/shared \
    && npm run build --workspace=@starnet/browser-worker

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    x11vnc \
    websockify \
    novnc \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=build /app/services/browser-worker/dist ./dist
COPY --from=build /app/services/browser-worker/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

EXPOSE 7500
CMD ["node", "dist/index.js"]
