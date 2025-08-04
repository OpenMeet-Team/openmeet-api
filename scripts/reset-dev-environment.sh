#!/bin/bash

# Reset Development Environment Script
# This script recreates the dev environment with fresh database restores

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Reset Development Environment ===${NC}"
echo "This script will:"
echo "1. Shut down all services and remove volumes"
echo "2. Start postgres"
echo "3. Restore databases (main + matrix)"
echo "4. Run tenant migrations"
echo "5. Start all services"
echo ""

# Step 1: Shut down everything
echo -e "${YELLOW}Step 1: Shutting down all services${NC}"
docker-compose -f docker-compose-dev.yml down -v
echo "✅ All services stopped and volumes removed"

# Step 2: Start postgres
echo -e "${YELLOW}Step 2: Starting postgres${NC}"
docker-compose -f docker-compose-dev.yml up -d postgres
echo "Waiting for postgres to be ready..."
sleep 5
echo "✅ Postgres started"

# Step 3: Restore databases
echo -e "${YELLOW}Step 3: Restoring databases${NC}"

# Find the most recent backups
echo "Finding backup files..."
# SYNAPSE_BACKUP=$(ls -t backups/synapse_backup*.sql 2>/dev/null | head -1)
MAIN_BACKUP=$(ls -t backups/full_backup*2025-07*.sql 2>/dev/null | head -1)

# if [ -z "$SYNAPSE_BACKUP" ]; then
#     echo -e "${RED}❌ No Synapse backup found${NC}"
#     exit 1
# fi

if [ -z "$MAIN_BACKUP" ]; then
    echo -e "${RED}❌ No main database backup found${NC}"
    exit 1
fi

echo "Using backups:"
# echo "  Synapse: $SYNAPSE_BACKUP"
echo "  Main DB: $MAIN_BACKUP"

# Extract timestamp from synapse backup
# TIMESTAMP=$(echo "$SYNAPSE_BACKUP" | sed 's/.*-\([0-9-]*_[0-9-]*\)\.sql/\1/')

# Restore matrix databases
# echo "Restoring Matrix and MAS databases..."
# echo "yes" | ./scripts/restore-matrix-mas-dbs.sh "$TIMESTAMP"

# Restore main database
echo "Restoring main database..."
echo "y" | ./scripts/restore-db-dev.sh "$MAIN_BACKUP"

echo "✅ Databases restored"

# Step 4: Run tenant migrations
echo -e "${YELLOW}Step 4: Running tenant migrations${NC}"
npm run migration:run:tenants
echo "✅ Tenant migrations completed"

# Step 5: Start all services
echo -e "${YELLOW}Step 5: Starting all services${NC}"
docker-compose -f docker-compose-dev.yml up -d

echo "Waiting for services to be ready..."
sleep 15

# Check if services are running
echo "Checking service status..."
docker-compose -f docker-compose-dev.yml ps

echo "✅ All services started"

echo ""
echo -e "${GREEN}=== Development Environment Reset Complete ===${NC}"
echo ""
echo "Available services:"
echo "  Matrix: http://localhost:8448"
echo "  MAS: http://localhost:8081"
echo "  Matrix Web: http://localhost:80"
echo "  PGAdmin: http://localhost:5050"
echo "  Maildev: http://localhost:1080"
echo ""
echo "Next steps:"
echo "  • Test Matrix: curl http://localhost:8448/_matrix/client/versions"
echo "  • Test MAS: curl http://localhost:8081/health"
echo "  • Check logs: docker-compose -f docker-compose-dev.yml logs -f matrix mas"