# syntax=docker/dockerfile:1

# Node 24 is the Active LTS line.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY src/api/package.json src/api/package.json
COPY src/web/package.json src/web/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY tsconfig*.json ./
COPY src ./src
COPY db ./db
# The web build runs first; the API image serves its output.
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY src/api/package.json src/api/package.json
COPY src/web/package.json src/web/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/src/api/dist ./src/api/dist
COPY --from=build /app/src/web/dist ./src/web/dist
COPY db ./db
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["./docker/entrypoint.sh"]
