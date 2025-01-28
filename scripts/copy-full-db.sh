#!/bin/sh

# Load environment variables
if [ ! -f .env ]; then
    echo ".env file not found!"
    exit 1
fi

# Use . instead of source for better shell compatibility
. ./.env

# Check required variables one by one (avoiding array usage for sh compatibility)
if [ -z "$SOURCE_DB" ] || [ -z "$DEST_DB" ] || [ -z "$SOURCE_HOST" ] || [ -z "$DEST_HOST" ] || \
   [ -z "$SOURCE_USER" ] || [ -z "$SOURCE_PASSWORD" ] || [ -z "$DEST_USER" ] || [ -z "$DEST_PASSWORD" ] || \
   [ -z "$SOURCE_S3_BUCKET" ] || [ -z "$DEST_S3_BUCKET" ]; then
    echo "Error: Missing required environment variables"
    exit 1
fi

echo "Exporting from $SOURCE_DB @ $SOURCE_HOST to $DEST_DB @ $DEST_HOST "
sleep 10

BACKUP_FILE="full_backup.sql"

echo "Exporting production database..."
PGPASSWORD=$SOURCE_PASSWORD pg_dump -h $SOURCE_HOST -U $SOURCE_USER -d $SOURCE_DB > $BACKUP_FILE

echo "Dropping and recreating test database..."

# First, terminate existing connections
PGPASSWORD=$DEST_PASSWORD psql -h $DEST_HOST -U $DEST_USER -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = '$DEST_DB' 
  AND pid <> pg_backend_pid();"

PGPASSWORD=$DEST_PASSWORD psql -h $DEST_HOST -U $DEST_USER -d postgres -c "DROP DATABASE IF EXISTS \"$DEST_DB\";"
PGPASSWORD=$DEST_PASSWORD psql -h $DEST_HOST -U $DEST_USER -d postgres -c "CREATE DATABASE \"$DEST_DB\";"

echo "Importing to test database..."
PGPASSWORD=$DEST_PASSWORD psql -h $DEST_HOST -U $DEST_USER -d $DEST_DB < $BACKUP_FILE

echo "Syncing media files..."
aws s3 sync s3://$SOURCE_S3_BUCKET s3://$DEST_S3_BUCKET

# Clean up
rm $BACKUP_FILE

echo "Database copy completed!"