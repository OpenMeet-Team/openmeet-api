#!/bin/bash
set -e

# Create an admin user for testing
register_new_matrix_user -u admin -p admin_secret_password -a -c /data/homeserver.yaml http://localhost:8448

echo "Matrix initialization complete"