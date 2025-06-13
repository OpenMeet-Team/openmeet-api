#!/bin/sh

# Script to restore database backup to development environment with matrix data sanitization
# This combines the restore process with automatic sanitization for dev use

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

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Error: Please provide the backup file path as an argument"
    echo "Usage: ./restore-db-dev.sh <backup_file_path>"
    echo ""
    echo "This script will:"
    echo "1. Restore the database from backup"
    echo "2. Sanitize matrix data for development environment"
    echo "3. Clear chat rooms and user associations"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file $BACKUP_FILE not found!"
    exit 1
fi

echo "=================================================="
echo "RESTORING DATABASE FOR DEVELOPMENT ENVIRONMENT"
echo "=================================================="
echo "Database: $DATABASE_NAME"
echo "Host: $DATABASE_HOST"
echo "Backup file: $BACKUP_FILE"
echo ""

# Confirm this is for development
echo "⚠️  WARNING: This will completely replace your current database!"
echo "⚠️  This script is intended for DEVELOPMENT environments only."
echo ""
printf "Are you sure you want to continue? (y/N): "
read -r confirmation
case "$confirmation" in
    [yY]|[yY][eE][sS])
        echo "Proceeding with restore..."
        ;;
    *)
        echo "Restore cancelled."
        exit 0
        ;;
esac

echo ""
echo "Step 1/3: Restoring database from backup..."
echo "=============================================="

echo "Terminating existing connections..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = '$DATABASE_NAME' 
  AND pid <> pg_backend_pid();"

echo "Dropping and recreating database..."
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d postgres -c "DROP DATABASE IF EXISTS \"$DATABASE_NAME\";"
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d postgres -c "CREATE DATABASE \"$DATABASE_NAME\";"

echo "Restoring database from $BACKUP_FILE"
PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME < $BACKUP_FILE

if [ $? -ne 0 ]; then
    echo "❌ Database restore failed!"
    exit 1
fi

echo "✅ Database restore completed successfully!"
echo ""

echo "Step 2/3: Sanitizing matrix data for development..."
echo "=================================================="

# Run the sanitization script
./scripts/sanitize-matrix-data.sh

if [ $? -ne 0 ]; then
    echo "❌ Matrix data sanitization failed!"
    exit 1
fi

echo ""
echo "Step 3/3: Development environment setup complete!"
echo "================================================"
echo "✅ Database restored from production backup"
echo "✅ Matrix data sanitized for development use"
echo ""
echo "Your development database is now ready with:"
echo "• All production data (users, events, groups, etc.)"
echo "• Matrix tokens and room IDs cleared"
echo "• Chat rooms reset for your dev matrix server"
echo ""
echo "You can now start your development matrix server and"
echo "users will be able to create new chat rooms as needed."