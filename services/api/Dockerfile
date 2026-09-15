# Production image for the NestJS API.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY services/api/package.json services/api/
COPY packages/shared packages/shared
COPY services/api services/api
RUN npm ci --workspace=@starnet/shared --workspace=@starnet/api \
    && npm run build --workspace=@starnet/shared \
    && npm run build --workspace=@starnet/api

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/services/api/dist ./dist
COPY --from=build /app/services/api/package.json ./package.json
COPY --from=build /app/services/api/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules

EXPOSE 8000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
