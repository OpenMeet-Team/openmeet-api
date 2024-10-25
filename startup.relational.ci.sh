#!/usr/bin/env bash
set -e

/opt/wait-for-it.sh postgres:5432
npm run migration:run:prod
npm run seed:run:prod


npm run start:prod > prod.log 2>&1 &
/opt/wait-for-it.sh maildev:1080
/opt/wait-for-it.sh localhost:3000
npm run test:e2e -- --runInBand
