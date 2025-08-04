#!/bin/sh

# Matrix and MAS Database Restore Script
# Restores Matrix Synapse and MAS databases to the current environment (based on .env)

if [ -z "$1" ]; then
    echo "Usage: $0 <timestamp>"
    echo "Example: $0 2025-01-08_14-30-45"
    echo ""
    echo "Available backups:"
    ls -la backups/*synapse_backup* 2>/dev/null | head -5
    ls -la backups/*mas_backup* 2>/dev/null | head -5
    exit 1
fi

TIMESTAMP=$1

# Load environment variables
if [ ! -f .env ]; then
    echo ".env file not found!"
    exit 1
fi

. ./.env

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

# Set target database names based on current environment
TARGET_SYNAPSE_DB_NAME="${SYNAPSE_DATABASE_NAME:-synapse}"
TARGET_MAS_DB_NAME="${MAS_DATABASE_NAME:-mas}"
TARGET_DB_HOST="$DATABASE_HOST"
TARGET_DB_USER="$DATABASE_USERNAME"
TARGET_DB_PASSWORD="$DATABASE_PASSWORD"

# Override MAS password if specified
if [ -n "$MAS_DATABASE_PASSWORD" ]; then
    TARGET_MAS_PASSWORD="$MAS_DATABASE_PASSWORD"
else
    TARGET_MAS_PASSWORD="$DATABASE_PASSWORD"
fi

echo "🔍 Detected environment: $ENVIRONMENT"
echo "   Target DB Host: $TARGET_DB_HOST"
echo "   Synapse DB: $TARGET_SYNAPSE_DB_NAME"
echo "   MAS DB: $TARGET_MAS_DB_NAME"

# PRODUCTION SAFETY: Never allow restore to production
if [ "$ENVIRONMENT" = "production" ]; then
    echo ""
    echo "🚨 SAFETY BLOCK: Cannot restore to PRODUCTION environment!"
    echo "   This script is only for dev/local environments."
    echo "   If you need to restore production, do it manually with extreme caution."
    exit 1
fi

# Check if backup files exist
echo ""
echo "🔍 Checking for backup files with timestamp: $TIMESTAMP"
SYNAPSE_BACKUP_FILE=$(find backups -name "*synapse_backup*$TIMESTAMP.sql" | head -1)
MAS_BACKUP_FILE=$(find backups -name "*mas_backup*$TIMESTAMP.sql" | head -1)

# Determine what we can restore
RESTORE_SYNAPSE=false
RESTORE_MAS=false

if [ -n "$SYNAPSE_BACKUP_FILE" ] && [ -f "$SYNAPSE_BACKUP_FILE" ]; then
    echo "✅ Found Matrix Synapse backup: $SYNAPSE_BACKUP_FILE"
    RESTORE_SYNAPSE=true
else
    echo "⚠️  Matrix Synapse backup not found for timestamp: $TIMESTAMP"
fi

if [ -n "$MAS_BACKUP_FILE" ] && [ -f "$MAS_BACKUP_FILE" ]; then
    echo "✅ Found MAS backup: $MAS_BACKUP_FILE"
    RESTORE_MAS=true
else
    echo "⚠️  MAS backup not found for timestamp: $TIMESTAMP"
fi

# Check if we have anything to restore
if [ "$RESTORE_SYNAPSE" = false ] && [ "$RESTORE_MAS" = false ]; then
    echo ""
    echo "❌ No backup files found for timestamp: $TIMESTAMP"
    echo "Available backups:"
    ls -la backups/*synapse_backup* 2>/dev/null | head -3
    ls -la backups/*mas_backup* 2>/dev/null | head -3
    exit 1
fi

echo ""
echo "⚠️  WARNING: This will COMPLETELY REPLACE the $ENVIRONMENT databases!"
if [ "$RESTORE_SYNAPSE" = true ]; then
    echo "   📦 Matrix Synapse: Will restore from $SYNAPSE_BACKUP_FILE"
else
    echo "   ⏭️  Matrix Synapse: Will skip (no backup file)"
fi
if [ "$RESTORE_MAS" = true ]; then
    echo "   📦 MAS: Will restore from $MAS_BACKUP_FILE"
else
    echo "   ⏭️  MAS: Will skip (no backup file)"
fi
echo ""
read -p "Are you sure you want to proceed? (yes/no): " confirmation
if [ "$confirmation" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 1
fi

# Restore Matrix Synapse database if backup exists
if [ "$RESTORE_SYNAPSE" = true ]; then
    echo "🗑️  Dropping and recreating Matrix Synapse database..."
    PGPASSWORD=$TARGET_DB_PASSWORD psql -h $TARGET_DB_HOST -U $TARGET_DB_USER -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET_SYNAPSE_DB_NAME\";"
    PGPASSWORD=$TARGET_DB_PASSWORD psql -h $TARGET_DB_HOST -U $TARGET_DB_USER -d postgres -c "CREATE DATABASE \"$TARGET_SYNAPSE_DB_NAME\" OWNER \"$TARGET_DB_USER\" LC_COLLATE='C' LC_CTYPE='C' TEMPLATE=template0;"

    echo "📦 Restoring Matrix Synapse database..."
    PGPASSWORD=$TARGET_DB_PASSWORD psql -h $TARGET_DB_HOST -U $TARGET_DB_USER -d $TARGET_SYNAPSE_DB_NAME < $SYNAPSE_BACKUP_FILE

    if [ $? -eq 0 ]; then
        echo "✅ Matrix Synapse database restored successfully"
    else
        echo "❌ Matrix Synapse database restore failed!"
        exit 1
    fi
else
    echo "⏭️  Skipping Matrix Synapse restore (no backup file)"
fi

# Restore MAS database if backup exists
if [ "$RESTORE_MAS" = true ]; then
    echo "🗑️  Dropping and recreating MAS database..."
    PGPASSWORD=$TARGET_MAS_PASSWORD psql -h $TARGET_DB_HOST -U $TARGET_DB_USER -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET_MAS_DB_NAME\";"
    PGPASSWORD=$TARGET_MAS_PASSWORD psql -h $TARGET_DB_HOST -U $TARGET_DB_USER -d postgres -c "CREATE DATABASE \"$TARGET_MAS_DB_NAME\" OWNER \"$TARGET_DB_USER\";"

    echo "📦 Restoring MAS database..."
    PGPASSWORD=$TARGET_MAS_PASSWORD psql -h $TARGET_DB_HOST -U $TARGET_DB_USER -d $TARGET_MAS_DB_NAME < $MAS_BACKUP_FILE

    if [ $? -eq 0 ]; then
        echo "✅ MAS database restored successfully"
    else
        echo "❌ MAS database restore failed!"
        exit 1
    fi
else
    echo "⏭️  Skipping MAS restore (no backup file)"
fi

echo ""
echo "🎉 Database restore completed for $ENVIRONMENT environment!"
if [ "$RESTORE_SYNAPSE" = true ]; then
    echo "   ✅ Matrix Synapse: $TARGET_SYNAPSE_DB_NAME on $TARGET_DB_HOST"
else
    echo "   ⏭️  Matrix Synapse: Skipped (no backup file)"
fi
if [ "$RESTORE_MAS" = true ]; then
    echo "   ✅ MAS: $TARGET_MAS_DB_NAME on $TARGET_DB_HOST"
else
    echo "   ⏭️  MAS: Skipped (no backup file)"
fi
echo ""

# Environment-specific next steps
if [ "$ENVIRONMENT" = "local" ]; then
    echo "💡 Next steps for local environment:"
    echo "   • Restart Matrix containers: docker compose -f docker-compose-dev.yml restart matrix matrix-auth-service"
    echo "   • Verify Matrix homeserver: http://localhost:8448/_matrix/client/versions"
    echo "   • Verify MAS: http://localhost:8080/health"
elif [ "$ENVIRONMENT" = "dev" ]; then
    echo "💡 Next steps for dev environment:"
    echo "   • Restart Matrix Synapse pods: kubectl rollout restart deployment/matrix-synapse -n dev"
    echo "   • Restart MAS pods: kubectl rollout restart deployment/mas -n dev"
    echo "   • Verify Matrix homeserver: https://matrix-dev.openmeet.net"
    echo "   • Verify MAS: https://mas-dev.openmeet.net"
else
    echo "💡 Next steps:"
    echo "   • Restart Matrix and MAS services in your $ENVIRONMENT environment"
fi