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
   [ -z "$PROD_USER" ] || [ -z "$PROD_PASSWORD" ] || [ -z "$TEST_USER" ] || [ -z "$TEST_PASSWORD" ]; then
    echo "Error: Missing required environment variables"
    exit 1
fi

BACKUP_FILE="full_backup.sql"

echo "Exporting production database..."
PGPASSWORD=$PROD_PASSWORD pg_dump -h $PROD_HOST -U $PROD_USER -d $PROD_DB > $BACKUP_FILE

echo "Dropping and recreating test database..."
PGPASSWORD=$TEST_PASSWORD psql -h $TEST_HOST -U $TEST_USER -d postgres -c "DROP DATABASE IF EXISTS \"$TEST_DB\";"
PGPASSWORD=$TEST_PASSWORD psql -h $TEST_HOST -U $TEST_USER -d postgres -c "CREATE DATABASE \"$TEST_DB\";"

echo "Importing to test database..."
PGPASSWORD=$TEST_PASSWORD psql -h $TEST_HOST -U $TEST_USER -d $TEST_DB < $BACKUP_FILE

# Clean up
rm $BACKUP_FILE

echo "Database copy completed!"