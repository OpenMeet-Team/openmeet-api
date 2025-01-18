#!/bin/sh

# Load environment variables
if [ ! -f .env ]; then
    echo ".env file not found!"
    exit 1
fi

# Use . instead of source for better shell compatibility
. ./.env

# Check required variables one by one (avoiding array usage for sh compatibility)
if [ -z "$PROD_DB" ] || [ -z "$TEST_DB" ] || [ -z "$PROD_HOST" ] || [ -z "$TEST_HOST" ] || \
   [ -z "$PROD_USER" ] || [ -z "$PROD_PASSWORD" ] || [ -z "$TEST_USER" ] || [ -z "$TEST_PASSWORD" ] || \
   [ -z "$PROD_S3_BUCKET" ] || [ -z "$TEST_S3_BUCKET" ]; then
    echo "Error: Missing required environment variables"
    exit 1
fi

echo "Exporting from $PROD_DB @ $PROD_HOST to $TEST_DB @ $TEST_HOST "
sleep 10

BACKUP_FILE="full_backup.sql"

echo "Exporting production database..."
PGPASSWORD=$PROD_PASSWORD pg_dump -h $PROD_HOST -U $PROD_USER -d $PROD_DB > $BACKUP_FILE

echo "Dropping and recreating test database..."

# First, terminate existing connections
PGPASSWORD=$TEST_PASSWORD psql -h $TEST_HOST -U $TEST_USER -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = '$TEST_DB' 
  AND pid <> pg_backend_pid();"

PGPASSWORD=$TEST_PASSWORD psql -h $TEST_HOST -U $TEST_USER -d postgres -c "DROP DATABASE IF EXISTS \"$TEST_DB\";"
PGPASSWORD=$TEST_PASSWORD psql -h $TEST_HOST -U $TEST_USER -d postgres -c "CREATE DATABASE \"$TEST_DB\";"

echo "Importing to test database..."
PGPASSWORD=$TEST_PASSWORD psql -h $TEST_HOST -U $TEST_USER -d $TEST_DB < $BACKUP_FILE

echo "Syncing media files..."
aws s3 sync s3://$PROD_S3_BUCKET s3://$TEST_S3_BUCKET

# Clean up
rm $BACKUP_FILE

echo "Database copy completed!"