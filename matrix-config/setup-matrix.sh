#!/bin/bash
set -e

# This script will:
# 1. Wait for Matrix server to be ready
# 2. Register an admin user
# 3. Get an access token
# 4. Export the token for the API to use

MATRIX_URL=${MATRIX_HOMESERVER_URL:-http://matrix:8448}
MATRIX_USER=${MATRIX_ADMIN_USERNAME:-admin}
MATRIX_PASSWORD=${MATRIX_ADMIN_PASSWORD:-admin_secret_password}
MATRIX_SERVER_NAME=${MATRIX_SERVER_NAME:-matrix-ci.openmeet.test}

echo "Waiting for Matrix server to be ready at ${MATRIX_URL}..."
until curl -s "${MATRIX_URL}/_matrix/client/versions" > /dev/null; do
  echo "Matrix server is not ready yet..."
  sleep 2
done
echo "Matrix server is ready!"

# Try to log in first (in case the user exists)
echo "Attempting to log in as ${MATRIX_USER}..."
LOGIN_DATA="{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"${MATRIX_USER}\"},\"password\":\"${MATRIX_PASSWORD}\"}"
LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "${LOGIN_DATA}" "${MATRIX_URL}/_matrix/client/v3/login")
echo "Login response: ${LOGIN_RESPONSE}"

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token // empty')

# If login failed, try to register
if [ -z "$ACCESS_TOKEN" ]; then
  echo "Login failed, attempting registration..."
  
  # Create user with regular registration first
  REGISTER_DATA="{\"username\":\"${MATRIX_USER}\",\"password\":\"${MATRIX_PASSWORD}\",\"auth\":{\"type\":\"m.login.dummy\"},\"admin\":true}"
  REGISTER_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "${REGISTER_DATA}" "${MATRIX_URL}/_matrix/client/v3/register")
  echo "Registration response: ${REGISTER_RESPONSE}"
  
  # Try to log in again after registration
  echo "Attempting to log in after registration..."
  LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "${LOGIN_DATA}" "${MATRIX_URL}/_matrix/client/v3/login")
  ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token // empty')
fi

if [ -z "$ACCESS_TOKEN" ]; then
  echo "WARNING: Could not get Matrix access token automatically."
  echo "Using default admin token from configuration for now."
  ACCESS_TOKEN="ci_test_matrix_admin_token"
else
  echo "Successfully obtained Matrix access token!"
fi

# Add the user ID in proper format
USER_ID="@${MATRIX_USER}:${MATRIX_SERVER_NAME}"

# Create a file with the environment variables
cat > /matrix-token.sh << EOF
export MATRIX_ADMIN_ACCESS_TOKEN="${ACCESS_TOKEN}"
export MATRIX_ADMIN_USER="${USER_ID}"
EOF

echo "Matrix setup complete! Access token and user ID saved to /matrix-token.sh"
echo "Matrix admin user: ${USER_ID}"
echo "Matrix access token: ${ACCESS_TOKEN:0:5}..."