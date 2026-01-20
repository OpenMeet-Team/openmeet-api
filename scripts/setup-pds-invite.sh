#!/bin/bash
# Setup PDS invite code for testing
# Run this before e2e tests when PDS_INVITE_REQUIRED=true
#
# Usage: ./scripts/setup-pds-invite.sh
# Requires: PDS_URL, PDS_ADMIN_PASSWORD environment variables
# Exports: PDS_INVITE_CODE

set -e

PDS_URL="${PDS_URL:-http://localhost:3101}"
PDS_ADMIN_PASSWORD="${PDS_ADMIN_PASSWORD:-local-dev-admin-password}"

echo "Creating PDS invite code..."
echo "PDS URL: $PDS_URL"

# Wait for PDS to be healthy
echo "Waiting for PDS health check..."
for i in {1..30}; do
  if curl -sf "$PDS_URL/xrpc/_health" > /dev/null 2>&1; then
    echo "PDS is healthy"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: PDS not healthy after 30 seconds"
    exit 1
  fi
  sleep 1
done

# Create invite code with high use count
RESPONSE=$(curl -sf -X POST "$PDS_URL/xrpc/com.atproto.server.createInviteCode" \
  -H "Authorization: Basic $(echo -n "admin:$PDS_ADMIN_PASSWORD" | base64)" \
  -H "Content-Type: application/json" \
  -d '{"useCount": 999999}')

INVITE_CODE=$(echo "$RESPONSE" | jq -r '.code')

if [ -z "$INVITE_CODE" ] || [ "$INVITE_CODE" = "null" ]; then
  echo "ERROR: Failed to create invite code"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "Created invite code: $INVITE_CODE"

# Export for use in tests
export PDS_INVITE_CODE="$INVITE_CODE"
echo "PDS_INVITE_CODE=$INVITE_CODE"

# If running in CI, write to env file
if [ -n "$GITHUB_ENV" ]; then
  echo "PDS_INVITE_CODE=$INVITE_CODE" >> "$GITHUB_ENV"
  echo "Exported to GITHUB_ENV"
fi
