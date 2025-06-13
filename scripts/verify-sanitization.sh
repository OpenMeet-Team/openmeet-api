#!/bin/sh

# Script to verify that matrix data sanitization was successful
# This checks that sensitive matrix data has been properly cleared

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

echo "Verifying matrix data sanitization..."
echo "====================================="

# Get all tenant schemas
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

TOTAL_ISSUES=0

for schema in $SCHEMAS; do
    echo ""
    echo "Checking schema: $schema"
    echo "------------------------"
    
    # Check users table for remaining matrix data
    MATRIX_USERS=$(PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -t -c "
    SELECT COUNT(*) FROM \"$schema\".\"users\" 
    WHERE \"matrixUserId\" IS NOT NULL 
       OR \"matrixAccessToken\" IS NOT NULL 
       OR \"matrixDeviceId\" IS NOT NULL
       OR (preferences IS NOT NULL AND preferences ? 'matrix');")
    
    if [ "$MATRIX_USERS" -gt 0 ]; then
        echo "❌ Found $MATRIX_USERS users with matrix data still present"
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    else
        echo "✅ Users: All matrix data cleared"
    fi
    
    # Check events table
    MATRIX_EVENTS=$(PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -t -c "
    SELECT COUNT(*) FROM \"$schema\".\"events\" 
    WHERE \"matrixRoomId\" IS NOT NULL;")
    
    if [ "$MATRIX_EVENTS" -gt 0 ]; then
        echo "❌ Found $MATRIX_EVENTS events with matrix room IDs still present"
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    else
        echo "✅ Events: All matrix room IDs cleared"
    fi
    
    # Check groups table
    MATRIX_GROUPS=$(PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -t -c "
    SELECT COUNT(*) FROM \"$schema\".\"groups\" 
    WHERE \"matrixRoomId\" IS NOT NULL;")
    
    if [ "$MATRIX_GROUPS" -gt 0 ]; then
        echo "❌ Found $MATRIX_GROUPS groups with matrix room IDs still present"
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    else
        echo "✅ Groups: All matrix room IDs cleared"
    fi
    
    # Check chatRooms table  
    MATRIX_CHATROOMS=$(PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -t -c "
    SELECT COUNT(*) FROM \"$schema\".\"chatRooms\" 
    WHERE \"matrixRoomId\" IS NOT NULL;")
    
    if [ "$MATRIX_CHATROOMS" -gt 0 ]; then
        echo "❌ Found $MATRIX_CHATROOMS chat rooms with matrix room IDs still present"
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    else
        echo "✅ Chat Rooms: All matrix room IDs cleared"
    fi
    
    # Check userChatRooms table
    USER_CHAT_ROOMS=$(PGPASSWORD=$DATABASE_PASSWORD psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -t -c "
    SELECT COUNT(*) FROM \"$schema\".\"userChatRooms\";")
    
    if [ "$USER_CHAT_ROOMS" -gt 0 ]; then
        echo "❌ Found $USER_CHAT_ROOMS user chat room associations still present"
        TOTAL_ISSUES=$((TOTAL_ISSUES + 1))
    else
        echo "✅ User Chat Rooms: All associations cleared"
    fi
done

echo ""
echo "Verification Summary"
echo "===================="

if [ "$TOTAL_ISSUES" -eq 0 ]; then
    echo "🎉 SUCCESS: Matrix data sanitization is complete!"
    echo "Your development environment is ready for testing."
    exit 0
else
    echo "❌ ISSUES FOUND: $TOTAL_ISSUES problems detected"
    echo "Some matrix data may not have been properly sanitized."
    echo "You may need to run the sanitization script again."
    exit 1
fi