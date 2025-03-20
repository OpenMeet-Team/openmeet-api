#!/bin/bash
set -e

# This script initializes a Matrix server:
# 1. Creates an admin user
# 2. Obtains an access token
# 3. Prints configuration instructions

# Configuration
MATRIX_USER=${MATRIX_ADMIN_USERNAME:-admin}
MATRIX_PASSWORD=${MATRIX_ADMIN_PASSWORD:-admin_secret_password}
MATRIX_HOST=${MATRIX_HOST:-localhost}
MATRIX_PORT=${MATRIX_PORT:-8448}
MATRIX_URL="http://${MATRIX_HOST}:${MATRIX_PORT}"
MATRIX_SERVER_NAME=${MATRIX_SERVER_NAME:-matrix-local.openmeet.test}

echo "==== Matrix Initialization Script ===="
echo "Matrix URL: $MATRIX_URL"
echo "Admin user: $MATRIX_USER"
echo "Server name: $MATRIX_SERVER_NAME"

# First, wait for Matrix to be available
echo "Waiting for Matrix server to start..."
max_retries=30
count=0
while ! curl -s "${MATRIX_URL}/_matrix/client/versions" > /dev/null && [ $count -lt $max_retries ]; do
  echo "  Matrix not ready yet, waiting... ($count/$max_retries)"
  sleep 2
  count=$((count + 1))
done

if [ $count -eq $max_retries ]; then
  echo "ERROR: Matrix server did not start in time."
  exit 1
fi

echo "Matrix server is online!"

# Check for existing credentials in persistent storage
CREDENTIALS_FILE="/data/media/matrix-credentials.json"
ACCESS_TOKEN=""
if [ -f "$CREDENTIALS_FILE" ]; then
  echo "Found existing credentials file, attempting to use stored token..."
  if command -v jq &> /dev/null; then
    STORED_ACCESS_TOKEN=$(jq -r '.access_token // empty' "$CREDENTIALS_FILE")
    STORED_USER_ID=$(jq -r '.user_id // empty' "$CREDENTIALS_FILE")
  else
    STORED_ACCESS_TOKEN=$(grep -o '"access_token":"[^"]*"' "$CREDENTIALS_FILE" | cut -d':' -f2 | tr -d '"')
    STORED_USER_ID=$(grep -o '"user_id":"[^"]*"' "$CREDENTIALS_FILE" | cut -d':' -f2 | tr -d '"')
  fi
  
  if [ -n "$STORED_ACCESS_TOKEN" ]; then
    echo "Validating stored access token..."
    # Verify the token is still valid with a whoami request
    WHOAMI_RESPONSE=$(curl -s -X GET -H "Authorization: Bearer $STORED_ACCESS_TOKEN" "${MATRIX_URL}/_matrix/client/v3/account/whoami")
    
    if echo "$WHOAMI_RESPONSE" | grep -q "user_id"; then
      echo "Stored access token is valid!"
      ACCESS_TOKEN="$STORED_ACCESS_TOKEN"
      USER_ID="$STORED_USER_ID"
    else
      echo "Stored token is invalid, will create a new one."
    fi
  fi
fi

# If no valid stored token, proceed with login/registration
if [ -z "$ACCESS_TOKEN" ]; then
  # Try to log in first (in case the user exists)
  echo "Attempting to log in as ${MATRIX_USER}..."
  LOGIN_DATA="{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"${MATRIX_USER}\"},\"password\":\"${MATRIX_PASSWORD}\"}"
  LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "${LOGIN_DATA}" "${MATRIX_URL}/_matrix/client/v3/login")

  ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token // empty')

  # If login failed, try to register
  if [ -z "$ACCESS_TOKEN" ]; then
    echo "Login failed, attempting registration..."
    
    # Enable registration temporarily if needed
    echo "Attempting to create admin user with shared secret..."
    
    # Try the register_new_matrix_user command first
    register_new_matrix_user -u "$MATRIX_USER" -p "$MATRIX_PASSWORD" -a -c /processed-config/homeserver.yaml "$MATRIX_URL" || {
      echo "Direct registration failed, trying alternate method..."
      
      # Try the m.login.dummy method as fallback
      REGISTER_DATA="{\"username\":\"${MATRIX_USER}\",\"password\":\"${MATRIX_PASSWORD}\",\"auth\":{\"type\":\"m.login.dummy\"},\"admin\":true}"
      REGISTER_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "${REGISTER_DATA}" "${MATRIX_URL}/_matrix/client/v3/register")
      echo "Registration response: ${REGISTER_RESPONSE}"
    }
    
    # Try to log in again after registration
    echo "Attempting to log in after registration..."
    LOGIN_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "${LOGIN_DATA}" "${MATRIX_URL}/_matrix/client/v3/login")
    ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token // empty')
  fi
fi

if [ -z "$ACCESS_TOKEN" ]; then
  echo "WARNING: Could not get Matrix access token automatically."
  echo "Using default admin token from configuration for now."
  ACCESS_TOKEN="local_dev_admin_token"
  USER_ID="@${MATRIX_USER}:${MATRIX_SERVER_NAME}"
else
  # Extract user ID from login response
  USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.user_id // empty')
  if [ -z "$USER_ID" ]; then
    USER_ID="@${MATRIX_USER}:${MATRIX_SERVER_NAME}"
  fi
  
  echo "Success! Matrix server initialized."
fi

echo "-------------------------------------"
echo "Admin user ID: $USER_ID"
echo "Access token: ${ACCESS_TOKEN:0:10}..."
echo ""
echo "Add these to your .env file:"
echo "MATRIX_ADMIN_ACCESS_TOKEN=$ACCESS_TOKEN"
echo "MATRIX_ADMIN_USER=$USER_ID"
echo "-------------------------------------"

# Create a file with the credentials
echo "export MATRIX_ADMIN_ACCESS_TOKEN=\"$ACCESS_TOKEN\"" > /data/matrix-credentials.sh
echo "export MATRIX_ADMIN_USER=\"$USER_ID\"" >> /data/matrix-credentials.sh

# Store credentials in persistent volume for reuse
CREDENTIALS_FILE="/data/media/matrix-credentials.json"
mkdir -p "$(dirname "$CREDENTIALS_FILE")"
echo "{\"user_id\":\"$USER_ID\",\"access_token\":\"$ACCESS_TOKEN\"}" > "$CREDENTIALS_FILE"
echo "Credentials saved to persistent storage at $CREDENTIALS_FILE"

echo "Matrix initialization complete"