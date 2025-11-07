#!/usr/bin/env bash
set -e

echo "Waiting for PostgreSQL to be ready..."
/opt/wait-for-it.sh postgres:5432
echo "Waiting for Redis to be ready..."
/opt/wait-for-it.sh redis:6379

# Run database migrations first, then seeds
echo "Running database migrations..."
npm run migration:run:tenants
echo "Running database seeds (including bot users)..."
npm run seed:run:prod

# Note: Matrix setup is now deferred and will happen after Matrix starts
echo "Matrix setup will be deferred until Matrix server is available..."

# Start the API service in the background
echo "Starting API service..."
npm run start:prod > prod.log 2>&1 &

# Start Matrix setup in the background (non-blocking)
echo "Starting Matrix setup task in background..."
(
  echo "Background task: Waiting for Matrix server to be ready..."
  /opt/wait-for-it.sh matrix:8448 -t 300  # 5 minute timeout
  if [ $? -eq 0 ]; then
    echo "Matrix server is ready, setting up admin user..."
    if [ -f /matrix-config/setup-matrix.sh ]; then
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
  else
    echo "WARNING: Matrix server did not become ready within timeout"
  fi
) &

# Wait for services to be fully ready
echo "Waiting for Maildev to be ready..."
/opt/wait-for-it.sh maildev:1080

echo "Waiting for API to be ready..."
/opt/wait-for-it.sh api:3000 -t 30

echo "Waiting for MAS service to be ready..."
/opt/wait-for-it.sh matrix-auth-service:8080 -t 60

echo "Waiting for Matrix service to be ready..."
/opt/wait-for-it.sh matrix:8448 -t 60

# Note: We don't wait for nginx here because nginx waits for our healthcheck (circular dependency)
# Nginx will become ready once our API is healthy, and tests will use it directly

# Run all E2E tests
echo "Running all E2E tests..."
npm run test:e2e -- --runInBand --forceExit


