#!/usr/bin/env bash
set -e

echo "Waiting for PostgreSQL to be ready..."
/opt/wait-for-it.sh postgres:5432
echo "Waiting for Redis to be ready..."
/opt/wait-for-it.sh redis:6379

# Run database migrations and seed before setting up Matrix
echo "Running database migrations..."
npm run migration:run:tenants

echo "Debugging: Checking migration results..."
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Migration check - tenant_testing tables:' as status; SELECT tablename FROM pg_tables WHERE schemaname = 'tenant_testing' ORDER BY tablename;"
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Migration check - tenant_testing enums:' as status; SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'tenant_testing') AND typtype = 'e';"

echo "Running database seeds..."
npm run seed:run:prod

echo "Debugging: Checking seed results..."
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Seed check - Group Permissions:' as status, COUNT(*) as count FROM tenant_testing.\"groupPermissions\";"
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Seed check - Group Roles:' as status, COUNT(*) as count FROM tenant_testing.\"groupRoles\";"
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Seed check - Event Permissions:' as status, COUNT(*) as count FROM tenant_testing.\"eventPermissions\";"
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Seed check - Event Roles:' as status, COUNT(*) as count FROM tenant_testing.\"eventRoles\";"

echo "Debugging: Checking group role permissions assignments..."
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Role-Permission assignments:' as status, COUNT(*) as count FROM tenant_testing.\"groupRolePermissions\";"

# Show specific messaging permissions if they exist
echo "Debugging: Checking messaging permissions specifically..."
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Messaging permissions:' as status, name::text FROM tenant_testing.\"groupPermissions\" WHERE name::text LIKE '%MESSAGE%' ORDER BY name;" || echo "No messaging permissions found or query failed"

# Show role names if they exist  
echo "Debugging: Checking role names..."
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Role names:' as status, name::text FROM tenant_testing.\"groupRoles\" ORDER BY name;" || echo "No roles found or query failed"

# If we have both roles and permissions, check assignments
echo "Debugging: Checking messaging role assignments..."
PGPASSWORD=secret psql -h postgres -U root api -c "SELECT 'Messaging role assignments:' as status, gr.name::text as role_name, gp.name::text as permission_name FROM tenant_testing.\"groupRoles\" gr JOIN tenant_testing.\"groupRolePermissions\" grp ON gr.id = grp.\"groupRoleId\" JOIN tenant_testing.\"groupPermissions\" gp ON grp.\"groupPermissionId\" = gp.id WHERE gp.name::text LIKE '%MESSAGE%' ORDER BY gr.name, gp.name;" || echo "No messaging role assignments found or query failed"

# Wait for Matrix and set up admin user
echo "Waiting for Matrix server to be ready..."
/opt/wait-for-it.sh matrix:8448

# Set up Matrix admin user and get an access token
echo "Setting up Matrix admin user..."
if [ -f /matrix-config/setup-matrix.sh ]; then
  # Execute setup script and source the generated token file
  bash /matrix-config/setup-matrix.sh
  if [ -f /matrix-token.sh ]; then
    source /matrix-token.sh
    echo "Matrix admin token obtained: ${MATRIX_ADMIN_ACCESS_TOKEN:0:5}..."
    export MATRIX_ADMIN_ACCESS_TOKEN
  else
    echo "WARNING: Matrix token file not found"
  fi
else
  echo "WARNING: Matrix setup script not found"
fi

# Start the API service in the background
echo "Starting API service..."
npm run start:prod > prod.log 2>&1 &

# Wait for services to be fully ready
echo "Waiting for Maildev to be ready..."
/opt/wait-for-it.sh maildev:1080

echo "Waiting for API to be ready..."
/opt/wait-for-it.sh api:3000 -t 30

# Run the E2E tests
echo "Running E2E tests..."
npm run test:e2e -- --runInBand


