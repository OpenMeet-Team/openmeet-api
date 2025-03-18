#!/bin/bash
set -x  # Enable debug mode to see what's happening

echo "Starting Matrix Synapse server..."
# Run Matrix directly without redirecting to background
exec python -m synapse.app.homeserver --config-path /data/homeserver.yaml