# Production image for the web app, run as a real Next.js server (not
# the static export used for GitHub Pages/Capacitor) so app.DOMAIN gets
# full SSR/runtime behavior.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm ci --workspace=@starnet/shared --workspace=@starnet/web \
    && npm run build --workspace=@starnet/shared \
    && npm run build --workspace=@starnet/web

FROM node:20-bookworm-slim
WORKDIR /app
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/next.config.js ./apps/web/next.config.js
COPY --from=build /app/node_modules ./node_modules

WORKDIR /app/apps/web
ENV PORT=3000 NEXT_PUBLIC_DATA_SOURCE=api
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
