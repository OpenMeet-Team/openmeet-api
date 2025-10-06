#!/bin/bash

# deploy to local dev

set -e

# Check if timestamp parameter is provided
if [ $# -eq 0 ]; then
    # Use the most recent backup timestamp for Matrix/MAS (September 18, 2025)
    API_TIMESTAMP="2025-09-18_10-33-02"
    MATRIX_TIMESTAMP="2025-09-18_10-33-59"
    echo "Using latest backup timestamps:"
    echo "  API Database: $API_TIMESTAMP"
    echo "  Matrix/MAS Databases: $MATRIX_TIMESTAMP"
    echo "  (to use different backup: $0 <api_timestamp> [matrix_timestamp])"
else
    API_TIMESTAMP="$1"
    MATRIX_TIMESTAMP="${2:-$1}"
    echo "Using provided timestamps:"
    echo "  API Database: $API_TIMESTAMP"
    echo "  Matrix/MAS Databases: $MATRIX_TIMESTAMP"
fi

ln -sf .env-local .env
DB_HOST=localhost
DB_PORT=5432
DB_USER=root
DB_PASSWORD=secret
MAIN_DB=api
SYNAPSE_DB=synapse
MAS_DB=mas

echo "=== OpenMeet Complete Deployment Workflow ==="
echo "API Timestamp: $API_TIMESTAMP"
echo "Matrix Timestamp: $MATRIX_TIMESTAMP"
echo "Target: $DB_HOST:$DB_PORT"
echo "Main DB: $MAIN_DB (restore)"
echo "Matrix DBs: $SYNAPSE_DB, $MAS_DB (restore)"
echo

read -p "Continue with full deployment? (yes): " -r
[[ ! $REPLY =~ ^yes$ ]] && exit 0

echo
echo "1. Stopping Matrix services..."
docker compose -f docker-compose-dev.yml down -v matrix-auth-service config-renderer matrix

echo
echo "2. Restoring main API database..."
./scripts/restore-db.sh "$API_TIMESTAMP"

echo
echo "3. Restoring Matrix/MAS databases..."
./scripts/restore-matrix-mas-dbs.sh "$MATRIX_TIMESTAMP"

echo
echo "4. Starting fresh Matrix services..."
docker compose -f docker-compose-dev.yml up -d matrix-auth-service config-renderer matrix

echo
echo "5. Running tenant migrations..."
npm run migration:run:tenants

echo
echo "✅ Complete deployment finished!"
echo "  • Matrix services: Stopped and restarted"
echo "  • Main DB: Restored from backup ($API_TIMESTAMP)"
echo "  • Matrix/MAS DBs: Restored from backup ($MATRIX_TIMESTAMP)"
echo "  • Tenant migrations: Applied to restored data"