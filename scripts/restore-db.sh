#!/bin/sh

# Main API Database Restore Script
# Restores the main API database to the current environment (based on .env)

if [ -z "$1" ]; then
    echo "Usage: $0 <timestamp>"
    echo "Example: $0 2025-07-07_22-09-54"
    echo ""
    echo "Available backups (most recent first):"
    ls -lat backups/full_backup* 2>/dev/null | head -10
    echo ""
    echo "💡 To use timestamp, extract it from the filename:"
    echo "   full_backup-...-2025-07-07_22-09-54.sql → use: 2025-07-07_22-09-54"
    exit 1
fi

TIMESTAMP=$1

# Load environment variables
if [ ! -f .env ]; then
    echo ".env file not found!"
    exit 1
fi

. ./.env

# Check required variables
if [ -z "$DATABASE_HOST" ] || \
   [ -z "$DATABASE_USERNAME" ] || \
   [ -z "$DATABASE_PASSWORD" ] || \
   [ -z "$DATABASE_NAME" ]; then
    echo "Error: Missing required environment variables"
    exit 1
fi

# Detect environment based on NODE_ENV first, then DATABASE_HOST as fallback
ENVIRONMENT="unknown"
if [ "$NODE_ENV" = "production" ]; then
    ENVIRONMENT="production"
elif [ "$NODE_ENV" = "development" ] && echo "$DATABASE_HOST" | grep -q "localhost"; then
    ENVIRONMENT="local"
elif [ "$NODE_ENV" = "development" ]; then
    ENVIRONMENT="dev"
elif echo "$DATABASE_HOST" | grep -q "localhost"; then
    ENVIRONMENT="local"
elif echo "$DATABASE_HOST" | grep -q "dev"; then
    ENVIRONMENT="dev"
elif echo "$DATABASE_HOST" | grep -q "prod"; then
    ENVIRONMENT="production"
fi

echo "🔍 Detected environment: $ENVIRONMENT"
echo "   Target DB Host: $DATABASE_HOST"
echo "   Target Database: $DATABASE_NAME"

# PRODUCTION SAFETY: Never allow restore to production
if [ "$ENVIRONMENT" = "production" ]; then
    echo ""
    echo "🚨 SAFETY BLOCK: Cannot restore to PRODUCTION environment!"
    echo "   This script is only for dev/local environments."
    echo "   If you need to restore production, do it manually with extreme caution."
    exit 1
fi

# Check if backup file exists
echo ""
echo "🔍 Checking for backup file with timestamp: $TIMESTAMP"
BACKUP_FILE=$(find backups -name "*full_backup*$TIMESTAMP.sql" | head -1)

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ API database backup file not found for timestamp: $TIMESTAMP"
    echo ""
    echo "Available backups (most recent first):"
    ls -lat backups/full_backup* 2>/dev/null | head -10
    echo ""
    echo "💡 Extract timestamp from filename: full_backup-...-YYYY-MM-DD_HH-MM-SS.sql"
    exit 1
fi

echo "✅ Found API database backup: $BACKUP_FILE"
echo "   Size: $(du -h $BACKUP_FILE | cut -f1)"

echo ""
echo "⚠️  WARNING: This will COMPLETELY REPLACE the $ENVIRONMENT database!"
echo "   📦 API Database: Will restore from $BACKUP_FILE"
echo "   🗄️  Target: $DATABASE_NAME on $DATABASE_HOST"
echo ""
read -p "Are you sure you want to proceed? (yes/no): " confirmation
if [ "$confirmation" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 1
fi

echo ""
echo "🔌 Terminating existing database connections..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = '$DATABASE_NAME' 
  AND pid <> pg_backend_pid();" 2>/dev/null

echo "🗑️  Dropping and recreating API database..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d postgres -c "DROP DATABASE IF EXISTS \"$DATABASE_NAME\";"
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d postgres -c "CREATE DATABASE \"$DATABASE_NAME\" OWNER \"$DATABASE_USERNAME\";"

echo "📦 Restoring API database from backup..."
PGPASSWORD=$DATABASE_PASSWORD psql \
    --single-transaction \
    --set ON_ERROR_STOP=on \
    -h $DATABASE_HOST \
    -U $DATABASE_USERNAME \
    -d $DATABASE_NAME < $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "✅ API database restored successfully"
else
    echo "❌ API database restore failed!"
    exit 1
fi

echo ""
echo "🎉 Database restore completed for $ENVIRONMENT environment!"
echo "   ✅ API Database: $DATABASE_NAME on $DATABASE_HOST"
echo "   📦 Restored from: $BACKUP_FILE"
echo ""

# Environment-specific next steps
if [ "$ENVIRONMENT" = "local" ]; then
    echo "💡 Next steps for local environment:"
    echo "   • Restart API containers: docker compose -f docker-compose-dev.yml restart api"
    echo "   • Verify API: http://localhost:3000/api/health"
    echo "   • Run any needed migrations: npm run migration:run"
elif [ "$ENVIRONMENT" = "dev" ]; then
    echo "💡 Next steps for dev environment:"
    echo "   • Restart API pods: kubectl scale deployment api --replicas=1 -n dev"
    echo "   • Verify API: https://api-dev.openmeet.net/api/health"
    echo "   • Check logs: kubectl logs -l app=api -n dev --tail=20"
else
    echo "💡 Next steps:"
    echo "   • Restart API services in your $ENVIRONMENT environment"
    echo "   • Verify database connectivity and run any needed migrations"
fi