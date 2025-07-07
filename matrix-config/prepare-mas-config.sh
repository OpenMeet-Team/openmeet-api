#!/bin/bash

# Script to prepare MAS configuration with generated keys
# This merges the base config with dynamically generated keys

set -e

ENVIRONMENT="${1:-dev}"
KEYS_DIR="${2:-/tmp/mas-keys}"
CONFIG_DIR="$(dirname "$0")"

# Ensure we have the keys
if [ ! -f "$KEYS_DIR/rsa-key-$ENVIRONMENT.pem" ] || [ ! -f "$KEYS_DIR/ec-key-$ENVIRONMENT.pem" ]; then
    echo "Keys not found, generating them..."
    "$CONFIG_DIR/generate-keys.sh" "$KEYS_DIR" "$ENVIRONMENT"
fi

# Read the base config
BASE_CONFIG="$CONFIG_DIR/mas-config-$ENVIRONMENT-base.yaml"
if [ ! -f "$BASE_CONFIG" ]; then
    echo "Error: Base config $BASE_CONFIG not found"
    exit 1
fi

# Read the keys
RSA_KEY_CONTENT=$(cat "$KEYS_DIR/rsa-key-$ENVIRONMENT.pem")
EC_KEY_CONTENT=$(cat "$KEYS_DIR/ec-key-$ENVIRONMENT.pem")

# Generate random encryption key if not set
ENCRYPTION_KEY="${MAS_ENCRYPTION_SECRET:-$(openssl rand -hex 32)}"

# Create the final config
OUTPUT_CONFIG="$CONFIG_DIR/mas-config-$ENVIRONMENT.yaml"

# Process the base config and inject the keys
{
    # Read the base config until we hit the secrets section
    sed '/^secrets:/q' "$BASE_CONFIG" | head -n -1
    
    # Add the secrets section with generated keys
    cat << EOF
secrets:
  encryption: "$ENCRYPTION_KEY"
  keys:
    # RSA key for RS256 algorithm ($ENVIRONMENT)
    - kid: "rsa-key-$ENVIRONMENT-001"
      key: |
$(echo "$RSA_KEY_CONTENT" | sed 's/^/        /')

    # EC P-256 key for ES256 algorithm ($ENVIRONMENT)
    - kid: "ec-key-$ENVIRONMENT-001"
      key: |
$(echo "$EC_KEY_CONTENT" | sed 's/^/        /')
EOF
    
    # Add the rest of the base config after the secrets section
    sed -n '/^secrets:/,/^[a-zA-Z]/p' "$BASE_CONFIG" | tail -n +2 | head -n -1
    sed -n '/^secrets:/,$p' "$BASE_CONFIG" | grep -A 9999 '^[a-zA-Z]' | grep -v '^secrets'
} > "$OUTPUT_CONFIG"

echo "MAS config prepared at $OUTPUT_CONFIG"