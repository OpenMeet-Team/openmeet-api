#!/bin/sh

# Script to sanitize matrix-related data for development environment
# This should be run after restoring production data to dev

# Load environment variables
if [ ! -f .env ]; then
    echo ".env file not found!"
    exit 1
fi

# Use . instead of source for better shell compatibility
. ./.env

# Check required variables
if [ -z "$DATABASE_HOST" ] || \
   [ -z "$DATABASE_USERNAME" ] || \
   [ -z "$DATABASE_PASSWORD" ] || \
   [ -z "$DATABASE_NAME" ]; then
    echo "Error: Missing required environment variables"
    exit 1
fi

echo "Starting matrix data sanitization for development environment..."

# Get all tenant schemas (exclude public and system schemas)
SCHEMAS=$(PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -t -c "
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name LIKE 'tenant_%' 
AND schema_name NOT LIKE '%tenant_tenant_%'
ORDER BY schema_name;")

if [ -z "$SCHEMAS" ]; then
    echo "No tenant schemas found"
    exit 1
fi

echo "Found tenant schemas: $SCHEMAS"

# Sanitize each tenant schema
for schema in $SCHEMAS; do
    echo "Sanitizing schema: $schema"
    
    # Check if tables exist in this schema before trying to update them
    TABLES_EXIST=$(PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -t -c "
    SELECT COUNT(*) FROM information_schema.tables 
    WHERE table_schema = '$schema' 
    AND table_name IN ('users', 'events', 'groups', 'chatRooms', 'userChatRooms');")
    
    if [ "$TABLES_EXIST" -eq 0 ]; then
        echo "  No relevant tables found in schema $schema, skipping..."
        continue
    fi
    
    # Start transaction for this schema
    PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME << EOF
BEGIN;

-- Clear user matrix data
UPDATE "$schema"."users" 
SET 
    "matrixUserId" = NULL,
    "matrixAccessToken" = NULL,
    "matrixDeviceId" = NULL,
    preferences = CASE 
        WHEN preferences IS NOT NULL AND preferences ? 'matrix' 
        THEN preferences - 'matrix'
        ELSE preferences
    END
WHERE "matrixUserId" IS NOT NULL 
   OR "matrixAccessToken" IS NOT NULL 
   OR "matrixDeviceId" IS NOT NULL
   OR (preferences IS NOT NULL AND preferences ? 'matrix');

-- Clear event matrix room IDs
UPDATE "$schema"."events" 
SET "matrixRoomId" = NULL 
WHERE "matrixRoomId" IS NOT NULL;

-- Clear group matrix room IDs
UPDATE "$schema"."groups" 
SET "matrixRoomId" = NULL 
WHERE "matrixRoomId" IS NOT NULL;

-- Clear chat room matrix IDs and remove user associations
DELETE FROM "$schema"."userChatRooms";
DELETE FROM "$schema"."chatRooms";

COMMIT;
EOF
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Successfully sanitized schema $schema"
    else
        echo "  ✗ Error sanitizing schema $schema"
        exit 1
    fi
done

echo "Matrix data sanitization completed successfully!"
echo ""
echo "Summary of changes:"
echo "- Cleared all user matrix tokens, user IDs, and device IDs"
echo "- Removed matrix preferences from user profiles"
echo "- Cleared matrix room IDs from events and groups"
echo "- Cleared all chat room data and user associations"
echo ""
echo "Your development environment is now ready for testing with a clean matrix state."