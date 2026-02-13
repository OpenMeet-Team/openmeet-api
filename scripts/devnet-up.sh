#!/usr/bin/env bash
# Start openmeet-api with ATProto devnet (PDS, PLC, Jetstream, TAP)
#
# Requires atproto-devnet cloned as a sibling: ../atproto-devnet/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEVNET_DIR="$(cd "$PROJECT_DIR/../atproto-devnet" 2>/dev/null && pwd)" || {
  echo "Error: atproto-devnet not found at ../atproto-devnet/"
  echo "Clone it: git clone https://github.com/OpenMeet-Team/atproto-devnet.git ../atproto-devnet"
  exit 1
}

compose() {
  docker compose \
    -f "$PROJECT_DIR/docker-compose-dev.yml" \
    -f "$DEVNET_DIR/docker-compose.yml" \
    -f "$PROJECT_DIR/docker-compose-devnet.yml" \
    --project-directory "$PROJECT_DIR" \
    "$@"
}

echo "Starting openmeet-api + atproto-devnet..."
echo "  Project:  $PROJECT_DIR"
echo "  Devnet:   $DEVNET_DIR"

# Read specific vars from .env (don't source — .env may have values that break bash)
env_val() { grep "^$1=" "$PROJECT_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-; }

# 1. Bring up all services
compose up -d "$@"

# 2. Wait for PDS to be healthy, then generate a fresh invite code
PDS_HOST="http://localhost:$(env_val DEVNET_PDS_PORT || echo 4000)"
PDS_PASS="$(env_val PDS_ADMIN_PASSWORD || echo devnet-admin-password)"

echo ""
echo "Waiting for PDS to be healthy..."
for i in $(seq 1 30); do
  if curl -sf "$PDS_HOST/xrpc/_health" > /dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Warning: PDS not healthy after 30s, skipping invite code setup"
    exit 0
  fi
  sleep 1
done

RESPONSE=$(curl -sf -X POST "$PDS_HOST/xrpc/com.atproto.server.createInviteCode" \
  -H "Authorization: Basic $(echo -n "admin:$PDS_PASS" | base64)" \
  -H "Content-Type: application/json" \
  -d '{"useCount": 999999}')

INVITE_CODE=$(echo "$RESPONSE" | jq -r '.code')

if [ -z "$INVITE_CODE" ] || [ "$INVITE_CODE" = "null" ]; then
  echo "Warning: Failed to create invite code: $RESPONSE"
else
  echo "PDS invite code: $INVITE_CODE"

  # 3. Update .env so future restarts use this code
  if grep -q "^PDS_INVITE_CODE=" "$PROJECT_DIR/.env" 2>/dev/null; then
    sed -i "s|^PDS_INVITE_CODE=.*|PDS_INVITE_CODE=$INVITE_CODE|" "$PROJECT_DIR/.env"
  else
    echo "PDS_INVITE_CODE=$INVITE_CODE" >> "$PROJECT_DIR/.env"
  fi

  # 4. Recreate API container to pick up the new invite code
  echo "Restarting API with fresh invite code..."
  compose up -d --force-recreate api
fi

echo ""
echo "Services:"
echo "  API:        http://localhost:$(env_val APP_PORT || echo 3000)"
echo "  PDS:        http://localhost:$(env_val DEVNET_PDS_PORT || echo 4000)"
echo "  PLC:        http://localhost:$(env_val DEVNET_PLC_PORT || echo 2582)"
echo "  Jetstream:  ws://localhost:$(env_val DEVNET_JETSTREAM_PORT || echo 6008)"
echo "  MailDev:    http://localhost:$(env_val MAIL_CLIENT_PORT || echo 1080)"
echo "  RabbitMQ:   http://localhost:25672"
