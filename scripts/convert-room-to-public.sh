#!/bin/bash
#
# Convert an encrypted Matrix room to a public room by deleting its alias.
# When the alias is next accessed, the AppService will create a new public room.
#
# Usage:
#   ./convert-room-to-public.sh <environment> <entity-type> <slug> <tenant-id>
#
# Examples:
#   ./convert-room-to-public.sh dev group louisville-yarnies-hpilpj lsdfaopkljdfs
#   ./convert-room-to-public.sh prod event my-event-slug lsdfaopkljdfs
#
# Environments:
#   dev  - Uses matrix-dev.openmeet.net with dev AppService token
#   prod - Uses matrix.openmeet.net with prod AppService token
#
# Token sources (in order of precedence):
#   1. MATRIX_APPSERVICE_TOKEN environment variable
#   2. Extracted from openmeet-infrastructure/k8s/environments/<env>/kustomization.yaml
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEV_MATRIX_SERVER="https://matrix-dev.openmeet.net"
PROD_MATRIX_SERVER="https://matrix.openmeet.net"
MATRIX_SERVER_NAME="matrix.openmeet.net"

# Find the script's directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INFRA_ROOT="$(cd "${PROJECT_ROOT}/../openmeet-infrastructure" 2>/dev/null && pwd)" || INFRA_ROOT=""

usage() {
    echo "Usage: $0 <environment> <entity-type> <slug> <tenant-id>"
    echo ""
    echo "Arguments:"
    echo "  environment  - 'dev' or 'prod'"
    echo "  entity-type  - 'group' or 'event'"
    echo "  slug         - The entity slug (e.g., 'louisville-yarnies-hpilpj')"
    echo "  tenant-id    - The tenant ID (e.g., 'lsdfaopkljdfs')"
    echo ""
    echo "Examples:"
    echo "  $0 dev group louisville-yarnies-hpilpj lsdfaopkljdfs"
    echo "  $0 prod event my-event-slug lsdfaopkljdfs"
    echo ""
    echo "Token sources (in order of precedence):"
    echo "  1. MATRIX_APPSERVICE_TOKEN environment variable"
    echo "  2. Extracted from openmeet-infrastructure/k8s/environments/<env>/kustomization.yaml"
    exit 1
}

get_token_from_kustomization() {
    local env="$1"
    local kustomization_file="${INFRA_ROOT}/k8s/environments/${env}/kustomization.yaml"

    if [ -z "$INFRA_ROOT" ] || [ ! -f "$kustomization_file" ]; then
        return 1
    fi

    # Extract the MATRIX_APPSERVICE_TOKEN from the kustomization file
    # Look for lines like: - MATRIX_APPSERVICE_TOKEN=xxx
    local token=$(grep -E "^\s*-\s*MATRIX_APPSERVICE_TOKEN=" "$kustomization_file" | head -1 | sed 's/.*MATRIX_APPSERVICE_TOKEN=//' | tr -d ' ')

    if [ -n "$token" ]; then
        echo "$token"
        return 0
    fi

    return 1
}

get_appservice_token() {
    local env="$1"

    # 1. Check environment variable first
    if [ -n "$MATRIX_APPSERVICE_TOKEN" ]; then
        echo "$MATRIX_APPSERVICE_TOKEN"
        return 0
    fi

    # 2. Try to extract from kustomization file
    local token=$(get_token_from_kustomization "$env")
    if [ -n "$token" ]; then
        echo "$token"
        return 0
    fi

    return 1
}

# Check arguments
if [ $# -ne 4 ]; then
    usage
fi

ENV="$1"
ENTITY_TYPE="$2"
SLUG="$3"
TENANT_ID="$4"

# Validate environment
if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    echo -e "${RED}Error: Environment must be 'dev' or 'prod'${NC}"
    usage
fi

# Validate entity type
if [ "$ENTITY_TYPE" != "group" ] && [ "$ENTITY_TYPE" != "event" ]; then
    echo -e "${RED}Error: Entity type must be 'group' or 'event'${NC}"
    usage
fi

# Set environment-specific variables
if [ "$ENV" == "dev" ]; then
    MATRIX_SERVER="$DEV_MATRIX_SERVER"
else
    MATRIX_SERVER="$PROD_MATRIX_SERVER"
fi

# Get AppService token
AS_TOKEN=$(get_appservice_token "$ENV")
if [ -z "$AS_TOKEN" ]; then
    echo -e "${RED}Error: Could not find AppService token${NC}"
    echo ""
    echo "Please either:"
    echo "  1. Set MATRIX_APPSERVICE_TOKEN environment variable"
    echo "  2. Ensure openmeet-infrastructure is available at: ${INFRA_ROOT:-'../openmeet-infrastructure'}"
    echo ""
    exit 1
fi

# Construct the room alias
ROOM_ALIAS="#${ENTITY_TYPE}-${SLUG}-${TENANT_ID}:${MATRIX_SERVER_NAME}"
ENCODED_ALIAS="%23${ENTITY_TYPE}-${SLUG}-${TENANT_ID}:${MATRIX_SERVER_NAME}"

echo ""
echo -e "${YELLOW}=== Matrix Room Conversion ===${NC}"
echo "Environment:   $ENV"
echo "Matrix Server: $MATRIX_SERVER"
echo "Entity Type:   $ENTITY_TYPE"
echo "Slug:          $SLUG"
echo "Tenant ID:     $TENANT_ID"
echo "Room Alias:    $ROOM_ALIAS"
echo ""

# Step 1: Check if alias exists
echo -e "${YELLOW}Step 1: Checking if room alias exists...${NC}"
EXISTING_ROOM=$(curl -s --globoff "${MATRIX_SERVER}/_matrix/client/v3/directory/room/${ENCODED_ALIAS}")

if echo "$EXISTING_ROOM" | grep -q "room_id"; then
    OLD_ROOM_ID=$(echo "$EXISTING_ROOM" | grep -o '"room_id":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✓ Room alias exists${NC}"
    echo "  Current room ID: $OLD_ROOM_ID"
else
    echo -e "${RED}✗ Room alias does not exist${NC}"
    echo "  Response: $EXISTING_ROOM"
    echo ""
    echo "Nothing to convert. The room will be created as public when first accessed."
    exit 0
fi

# Step 2: Check if room is encrypted
echo ""
echo -e "${YELLOW}Step 2: Checking if room is encrypted...${NC}"
ENCRYPTION_STATE=$(curl -s --globoff \
    "${MATRIX_SERVER}/_matrix/client/v3/rooms/${OLD_ROOM_ID}/state/m.room.encryption/" \
    -H "Authorization: Bearer ${AS_TOKEN}")

if echo "$ENCRYPTION_STATE" | grep -q "M_NOT_FOUND"; then
    echo -e "${GREEN}✓ Room is NOT encrypted${NC}"
    echo ""
    echo "This room is already public/unencrypted. No conversion needed."
    exit 0
elif echo "$ENCRYPTION_STATE" | grep -q "algorithm"; then
    echo -e "${YELLOW}! Room IS encrypted - needs conversion${NC}"
else
    echo -e "${YELLOW}? Could not determine encryption state${NC}"
    echo "  Response: $ENCRYPTION_STATE"
fi

# Step 3: Confirm before proceeding
echo ""
echo -e "${RED}WARNING: This will delete the room alias and all message history will be lost!${NC}"
echo "A new public room will be created when someone next accesses the chat."
echo ""
read -p "Do you want to proceed? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Step 4: Delete the room alias
echo ""
echo -e "${YELLOW}Step 3: Deleting room alias...${NC}"
DELETE_RESULT=$(curl -s --globoff -X DELETE \
    "${MATRIX_SERVER}/_matrix/client/v3/directory/room/${ENCODED_ALIAS}" \
    -H "Authorization: Bearer ${AS_TOKEN}")

if [ "$DELETE_RESULT" == "{}" ]; then
    echo -e "${GREEN}✓ Room alias deleted successfully${NC}"
else
    echo -e "${RED}✗ Failed to delete room alias${NC}"
    echo "  Response: $DELETE_RESULT"
    exit 1
fi

# Step 5: Verify alias is gone or new room created
echo ""
echo -e "${YELLOW}Step 4: Verifying...${NC}"
sleep 1

NEW_ROOM=$(curl -s --globoff "${MATRIX_SERVER}/_matrix/client/v3/directory/room/${ENCODED_ALIAS}")

if echo "$NEW_ROOM" | grep -q "room_id"; then
    NEW_ROOM_ID=$(echo "$NEW_ROOM" | grep -o '"room_id":"[^"]*"' | cut -d'"' -f4)

    if [ "$NEW_ROOM_ID" != "$OLD_ROOM_ID" ]; then
        echo -e "${GREEN}✓ New room created: $NEW_ROOM_ID${NC}"

        # Check if new room is unencrypted
        NEW_ENCRYPTION=$(curl -s --globoff \
            "${MATRIX_SERVER}/_matrix/client/v3/rooms/${NEW_ROOM_ID}/state/m.room.encryption/" \
            -H "Authorization: Bearer ${AS_TOKEN}")

        if echo "$NEW_ENCRYPTION" | grep -q "M_NOT_FOUND"; then
            echo -e "${GREEN}✓ New room is NOT encrypted (public)${NC}"
        else
            echo -e "${YELLOW}? New room encryption state unclear${NC}"
        fi
    else
        echo -e "${YELLOW}? Same room ID returned - alias may not have been fully deleted${NC}"
    fi
elif echo "$NEW_ROOM" | grep -q "M_NOT_FOUND"; then
    echo -e "${GREEN}✓ Alias deleted - new room will be created on next access${NC}"
else
    echo -e "${YELLOW}? Unexpected response: $NEW_ROOM${NC}"
fi

echo ""
echo -e "${GREEN}=== Conversion Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Have a user access the chat for this ${ENTITY_TYPE}"
echo "2. The AppService will create a new public room"
echo "3. The database will be updated automatically"
echo ""
