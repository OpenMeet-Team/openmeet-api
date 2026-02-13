#!/usr/bin/env bash
# Stop openmeet-api + ATProto devnet
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEVNET_DIR="$(cd "$PROJECT_DIR/../atproto-devnet" 2>/dev/null && pwd)" || {
  echo "Error: atproto-devnet not found at ../atproto-devnet/"
  exit 1
}

docker compose \
  -f "$PROJECT_DIR/docker-compose-dev.yml" \
  -f "$DEVNET_DIR/docker-compose.yml" \
  -f "$PROJECT_DIR/docker-compose-devnet.yml" \
  --project-directory "$PROJECT_DIR" \
  down "$@"
