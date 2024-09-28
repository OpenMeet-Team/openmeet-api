#!/usr/bin/env bash
set -e

/opt/wait-for-it.sh postgres:5432
/opt/wait-for-it.sh maildev:1080
npm install
npm seed:run:prod
npm run migration:run
npm run seed:run:relational
npm run start:swc
