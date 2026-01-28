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

# Setup PDS invite code BEFORE starting API (so API has it in environment)
echo "Waiting for PDS to be ready..."
/opt/wait-for-it.sh pds:3000 -t 60

echo "Creating PDS invite code..."
INVITE_RESPONSE=$(curl -sf -X POST "http://pds:3000/xrpc/com.atproto.server.createInviteCode" \
  -H "Authorization: Basic $(echo -n 'admin:ci-pds-admin-password' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"useCount": 999999}' 2>&1) || true

if [ -n "$INVITE_RESPONSE" ]; then
  PDS_INVITE_CODE=$(echo "$INVITE_RESPONSE" | jq -r '.code // empty')
  if [ -n "$PDS_INVITE_CODE" ]; then
    export PDS_INVITE_CODE
    echo "PDS invite code created: $PDS_INVITE_CODE"
  else
    echo "WARNING: Failed to parse invite code from response: $INVITE_RESPONSE"
  fi
else
  echo "WARNING: Failed to create PDS invite code (PDS may have invites disabled)"
fi

# Start the API service in the background (with PDS_INVITE_CODE in environment)
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
/opt/wait-for-it.sh matrix-auth-service:8080 -t 60 || echo "WARNING: MAS did not become ready, matrix tests may fail"

echo "Waiting for Matrix service to be ready..."
/opt/wait-for-it.sh matrix:8448 -t 60 || echo "WARNING: Matrix did not become ready, matrix tests may fail"

# Wait for nginx to be ready
echo "Waiting for Nginx to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
until curl -f http://nginx/health 2>/dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Waiting for nginx... attempt $RETRY_COUNT/$MAX_RETRIES"
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "WARNING: Nginx did not become ready, tests may fail"
else
  echo "Nginx is ready!"
fi

# Run E2E tests (PDS invite code was set up before API started)
if [ -n "$TEST_PATH_PATTERN" ]; then
  echo "Running E2E tests matching pattern: $TEST_PATH_PATTERN"
  npm run test:e2e -- --runInBand --forceExit --testPathPattern="$TEST_PATH_PATTERN"
else
  echo "Running all E2E tests..."
  npm run test:e2e -- --runInBand --forceExit
fi


