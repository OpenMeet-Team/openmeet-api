#!/bin/bash
# Vacuum bloated tables to reclaim space and improve performance
# Run this script manually when table bloat is detected

set -e

# Check if environment argument is provided
if [ -z "$1" ]; then
  echo "Usage: ./scripts/vacuum-bloated-tables.sh [local|dev|prod]"
  echo "Example: ./scripts/vacuum-bloated-tables.sh dev"
  exit 1
fi

ENV=$1

echo "🧹 Starting VACUUM operation for $ENV environment..."

# Load database credentials from .env file
ENV_FILE=".env-$ENV"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: $ENV_FILE not found"
  exit 1
fi

# Load environment variables
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Set database connection variables
DB_HOST="${DATABASE_HOST}"
DB_USER="${DATABASE_USERNAME}"
DB_PASS="${DATABASE_PASSWORD}"
DB_NAME="${DATABASE_NAME}"

echo "✓ Loaded $ENV database credentials"
echo "  Host: $DB_HOST"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"

# List of tenant schemas to vacuum
TENANT_SCHEMAS=("tenant_lsdfaopkljdfs" "tenant_oiupsdknasfdf")

for SCHEMA in "${TENANT_SCHEMAS[@]}"; do
  echo ""
  echo "📊 Vacuuming tables in schema: $SCHEMA"

  PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << EOF
-- Switch to tenant schema
SET search_path TO $SCHEMA;

-- Vacuum tables with high dead tuple percentage
-- calendarSources: 90.91% dead
VACUUM ANALYZE $SCHEMA."calendarSources";

-- groups: 43.75% dead
VACUUM ANALYZE $SCHEMA."groups";

-- eventSeries: 42.00% dead
VACUUM ANALYZE $SCHEMA."eventSeries";

-- groupMembers: 18.27% dead
VACUUM ANALYZE $SCHEMA."groupMembers";

-- users: 14.91% dead
VACUUM ANALYZE $SCHEMA."users";

-- sessions: 7.64% dead (but high volume table)
VACUUM ANALYZE $SCHEMA."sessions";

-- events: 8.56% dead
VACUUM ANALYZE $SCHEMA."events";

-- Show table sizes after vacuum
SELECT
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE schemaname = '$SCHEMA'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
EOF

  echo "✅ Completed vacuum for $SCHEMA"
done

# Also vacuum public schema matrixHandleRegistry (97.42% sequential scans)
echo ""
echo "📊 Vacuuming public schema tables"
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
VACUUM ANALYZE public."matrixHandleRegistry";
SELECT
  'matrixHandleRegistry' as table_name,
  pg_size_pretty(pg_total_relation_size('public."matrixHandleRegistry"'::regclass)) AS total_size,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname = 'matrixHandleRegistry';
EOF

echo ""
echo "✅ All VACUUM operations completed successfully!"
echo ""
echo "💡 Next steps:"
echo "   1. Monitor table bloat with the database-explore skill"
echo "   2. Consider setting up automated cleanup jobs for sessions table"
echo "   3. Run migration: npm run migration:run to add performance indexes"
