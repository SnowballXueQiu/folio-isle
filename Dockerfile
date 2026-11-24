# syntax=docker/dockerfile:1
# One image, two roles: the web app (default CMD) and the AI worker (`node dist/worker/main.js`).
FROM docker.io/library/node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM docker.io/library/node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM docker.io/library/node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/migrations ./migrations
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/scripts/healthcheck.js ./scripts/healthcheck.js
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD ["node", "scripts/healthcheck.js", "web"]
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node server.js"]
