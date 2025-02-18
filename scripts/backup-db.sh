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

BACKUP_FILE="backups/full_backup-$DATABASE_HOST-$DATABASE_NAME-$(date +%Y-%m-%d_%H-%M-%S).sql"

echo "Exporting production database to $BACKUP_FILE"
PGPASSWORD=$DATABASE_PASSWORD pg_dump -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME > $BACKUP_FILE