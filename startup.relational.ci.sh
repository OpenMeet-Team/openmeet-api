#!/usr/bin/env bash
set -e

echo "Waiting for PostgreSQL to be ready..."
/opt/wait-for-it.sh postgres:5432
echo "Waiting for Redis to be ready..."
/opt/wait-for-it.sh redis:6379

# Run database migrations and seed before setting up Matrix
echo "Running database migrations..."
npm run migration:run:tenants
echo "Running database seeds..."
npm run seed:run:prod

# Wait for Matrix and set up admin user
echo "Waiting for Matrix server to be ready..."
/opt/wait-for-it.sh matrix:8448

# Set up Matrix admin user and get an access token
echo "Setting up Matrix admin user..."
if [ -f /matrix-config/setup-matrix.sh ]; then
  # Execute setup script and source the generated token file
  bash /matrix-config/setup-matrix.sh
  if [ -f /matrix-token.sh ]; then
    source /matrix-token.sh
    echo "Matrix admin token obtained: ${MATRIX_ADMIN_ACCESS_TOKEN:0:5}..."
    export MATRIX_ADMIN_ACCESS_TOKEN
  else
    echo "WARNING: Matrix token file not found"
  fi
else
  echo "WARNING: Matrix setup script not found"
fi

# Start the API service in the background
echo "Starting API service..."
npm run start:prod > prod.log 2>&1 &

# Wait for services to be fully ready
echo "Waiting for Maildev to be ready..."
/opt/wait-for-it.sh maildev:1080

ps -ef || true
sleep 20
tail -20 prod.log || true

echo "Waiting for API to be ready..."
/opt/wait-for-it.sh localhost:3000 -t 120

# Run the E2E tests
echo "Running E2E tests..."
npm run test:e2e -- --runInBand


