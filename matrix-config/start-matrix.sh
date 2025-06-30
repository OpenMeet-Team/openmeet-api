#!/bin/bash
set -e  # Exit on error
set -x  # Enable debug mode to see what's happening

echo "Starting Matrix Synapse server..."

# Create processed configuration directory if it doesn't exist
mkdir -p /processed-config

# Process the homeserver.yaml template with environment variables
echo "Processing homeserver.yaml template..."

# Export environment variables with defaults for local development
# These match the variables used in Kubernetes configuration
export SYNAPSE_SERVER_NAME=${SYNAPSE_SERVER_NAME:-matrix-local.openmeet.test}
export POSTGRES_HOST=${POSTGRES_HOST:-postgres}
export POSTGRES_USER=${POSTGRES_USER:-root}
export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-secret}
export POSTGRES_DB=${POSTGRES_DB:-synapse}
export SYNAPSE_REGISTRATION_SHARED_SECRET=${SYNAPSE_REGISTRATION_SHARED_SECRET:-local_test_registration_secret}
export SYNAPSE_MACAROON_SECRET_KEY=${SYNAPSE_MACAROON_SECRET_KEY:-macaroon_secret_key}
export SYNAPSE_FORM_SECRET=${SYNAPSE_FORM_SECRET:-form_secret}

# Make sure fallback for backwards compatibility
if [ -n "${MATRIX_REGISTRATION_SECRET}" ] && [ -z "${SYNAPSE_REGISTRATION_SHARED_SECRET}" ]; then
  export SYNAPSE_REGISTRATION_SHARED_SECRET="${MATRIX_REGISTRATION_SECRET}"
fi

# Export MAS environment variables for MSC3861 configuration
export MAS_ISSUER=${MAS_ISSUER:-}
export MAS_CLIENT_SECRET=${MAS_CLIENT_SECRET:-}
export MAS_ADMIN_TOKEN=${MAS_ADMIN_TOKEN:-}

# Copy log config
cp /data/log.config /processed-config/

# Use envsubst to replace environment variables in the template
# This matches how the Kubernetes init container processes the template
echo "Running envsubst on homeserver.yaml template..."
envsubst < /data/homeserver.yaml > /processed-config/homeserver.yaml

echo "Configuration file contents:"
cat /processed-config/homeserver.yaml | grep -v password | head -30

echo "Configuration processed. Starting Synapse..."
# Run Matrix with processed config
exec python -m synapse.app.homeserver --config-path /processed-config/homeserver.yaml