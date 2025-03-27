# Matrix Configuration Guide

This guide documents the environment variables used for Matrix integration in OpenMeet.

## Required Environment Variables

```
# Core Matrix Configuration
MATRIX_HOMESERVER_URL=http://localhost:8448     # Primary URL for Matrix server
MATRIX_SERVER_NAME=matrix-local.openmeet.test   # Domain name for Matrix IDs
MATRIX_ADMIN_USERNAME=admin                     # Admin username (without @ or domain)
MATRIX_ADMIN_PASSWORD=your-admin-password       # Required for token generation
MATRIX_REGISTRATION_SECRET=shared_secret        # For user registration
```

## Optional Environment Variables

```
# Optional Configuration (all have reasonable defaults)
MATRIX_DEFAULT_DEVICE_ID=OPENMEET_SERVER        # Device ID for Matrix clients
MATRIX_DEFAULT_DEVICE_DISPLAY_NAME=OpenMeet     # Display name for Matrix clients
MATRIX_CONNECTION_POOL_SIZE=10                  # Number of Matrix clients in pool
MATRIX_CONNECTION_POOL_TIMEOUT=30000            # Client pool timeout in ms
MATRIX_CONNECTION_RETRY_ATTEMPTS=3              # Number of retry attempts
MATRIX_CONNECTION_RETRY_DELAY=1000              # Delay between retries in ms
MATRIX_ADMIN_ACCESS_TOKEN=                      # Optional, leave empty to generate automatically
```

## Deprecated Environment Variables

```
# Deprecated - should not be used in new deployments
MATRIX_ADMIN_USER                               # Replaced by using MATRIX_ADMIN_USERNAME
MATRIX_BASE_URL                                 # Use MATRIX_HOMESERVER_URL instead 
MATRIX_SERVER_URL                               # Use MATRIX_HOMESERVER_URL instead
```

## Notes

1. The Matrix admin user ID is constructed automatically as `@{MATRIX_ADMIN_USERNAME}:{MATRIX_SERVER_NAME}`

2. The Matrix admin access token is generated automatically using the admin password. You don't need to set it manually.

3. When the server starts, it:
   - Initializes with environment variables
   - Generates an admin token if not provided
   - Verifies admin access with the token
   - Creates a pool of Matrix clients for handling requests

4. If you encounter a 403 error during token generation:
   - Verify that the admin user exists on the Matrix server
   - Check that the password is correct
   - Ensure the Matrix server URL is accessible
   - Check that the server name matches the Matrix server's configured domain