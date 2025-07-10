#!/bin/sh

# Load environment variables
if [ ! -f .env ]; then
    echo ".env file not found!"
    exit 1
fi

# Use . instead of source for better shell compatibility
. ./.env

# Check required variables one by one (avoiding array usage for sh compatibility)
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

BACKUP_FILE="backups/full_backup-$DATABASE_HOST-$DATABASE_NAME-$(date +%Y-%m-%d_%H-%M-%S).sql"

echo "🔍 Detected environment: $ENVIRONMENT"
echo "   Database Host: $DATABASE_HOST"
echo "   Database Name: $DATABASE_NAME"
echo ""

# Safety confirmation for production
if [ "$ENVIRONMENT" = "production" ]; then
    echo "⚠️  WARNING: You are about to backup PRODUCTION database!"
    echo "   This is safe (read-only operation) but please confirm:"
    read -p "Continue with production backup? (yes/no): " confirmation
    if [ "$confirmation" != "yes" ]; then
        echo "❌ Backup cancelled"
        exit 1
    fi
fi

echo "📦 Exporting database to $BACKUP_FILE"
PGPASSWORD=$DATABASE_PASSWORD pg_dump \
    --no-password \
    --verbose \
    --no-privileges \
    --no-owner \
    --serializable-deferrable \
    -h $DATABASE_HOST \
    -U $DATABASE_USERNAME \
    -d $DATABASE_NAME > $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "✅ Database backup completed successfully"
    echo "   File: $BACKUP_FILE"
    echo "   Size: $(du -h $BACKUP_FILE | cut -f1)"
else
    echo "❌ Database backup failed!"
    exit 1
fi