#!/bin/sh
# Migrations, conditional seeding and the server all happen inside boot.js, so
# the container and a plain hosting platform run the identical sequence.
set -e
exec node src/api/dist/boot.js
