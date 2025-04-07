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

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "Error: Please provide the backup file path as an argument"
    echo "Usage: ./restore-db.sh <backup_file_path>"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file $BACKUP_FILE not found!"
    exit 1
fi

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

echo "Database restore completed successfully!" 