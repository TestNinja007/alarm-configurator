#!/bin/sh
# Applies migrations, seeds the requested profile, then starts the server.
# Migrations are idempotent, so restarting the container is safe.
set -e

echo "Applying migrations..."
node src/api/dist/db/migrate.js

echo "Seeding the \"${SEED_PROFILE:-demo}\" profile..."
node src/api/dist/seed/run.js "${SEED_PROFILE:-demo}"

echo "Starting Alarm Configurator on port ${PORT:-8080}..."
exec node src/api/dist/index.js
