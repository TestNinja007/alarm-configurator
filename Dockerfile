# syntax=docker/dockerfile:1

# One build, two images, one per service:
#
#   api     the main application, which also serves the built web app
#   speech  the speech service (src/speech), the one part run on its own
#
# docker-compose.yml runs both, with PostgreSQL and Mailpit beside them, and
# CI's `container` job builds and starts that stack on every push. Production
# does not run these images: render.yaml deploys to Render's Node runtime.

# Node 24, as in .node-version, CI and Render.
FROM node:24-alpine AS deps
WORKDIR /app
# Every workspace's manifest, so npm ci sees the set the lockfile records.
COPY package.json package-lock.json ./
COPY src/api/package.json src/api/package.json
COPY src/web/package.json src/web/package.json
COPY src/speech/package.json src/speech/package.json
RUN npm ci

FROM deps AS build
COPY src ./src
RUN npm run build

# Production dependencies only, shared by both images.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY src/api/package.json src/api/package.json
COPY src/web/package.json src/web/package.json
COPY src/speech/package.json src/speech/package.json
RUN npm ci --omit=dev && npm cache clean --force

FROM runtime AS speech
COPY --from=build /app/src/speech/dist ./src/speech/dist
# Read at startup from beside dist/: the service migrates its own schema.
COPY src/speech/migrations ./src/speech/migrations
# The service's own default is 127.0.0.1, which nothing outside this container
# could reach - including the API in the container next to it.
ENV SPEECH_HOST=0.0.0.0
USER node
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.SPEECH_PORT || 8090) + '/health').then((r) => r.json()).then((b) => process.exit(b.status === 'ok' ? 0 : 1), () => process.exit(1))"]
# Refuses to start without SPEECH_SERVICE_TOKEN and a database.
CMD ["node", "src/speech/dist/index.js"]

# Last, so a plain `docker build .` still builds the main application.
FROM runtime AS api
COPY --from=build /app/src/api/dist ./src/api/dist
COPY --from=build /app/src/web/dist ./src/web/dist
# Migrations and seed data, read at startup.
COPY db ./db
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/v1/health').then((r) => r.json()).then((b) => process.exit(b.status === 'ok' ? 0 : 1), () => process.exit(1))"]
# boot.js migrates, seeds if SEED_ON_START says so, then serves: the sequence
# `npm start` runs on Render. Node handles SIGTERM itself, so no init wrapper.
CMD ["node", "src/api/dist/boot.js"]
