#!/bin/sh

# Matrix and MAS Database Backup Script
# Backs up both Matrix Synapse and MAS databases from production
# Note: Matrix Synapse requires 'C' collation, which is handled by the restore script

# Load environment variables
if [ ! -f .env ]; then
    echo ".env file not found!"
    exit 1
fi

# Use . instead of source for better shell compatibility
. ./.env

# Check required variables for Matrix Synapse
if [ -z "$DATABASE_HOST" ] || \
   [ -z "$DATABASE_USERNAME" ] || \
   [ -z "$DATABASE_PASSWORD" ]; then
    echo "Error: Missing required database environment variables (DATABASE_HOST, DATABASE_USERNAME, DATABASE_PASSWORD)"
    exit 1
fi

# Set database names (can be overridden by environment variables)
SYNAPSE_DB_NAME="${SYNAPSE_DATABASE_NAME:-synapse}"
MAS_DB_NAME="${MAS_DATABASE_NAME:-mas}"

# Set database hosts (defaults to main DATABASE_HOST if not specified)
SYNAPSE_DB_HOST="${SYNAPSE_DATABASE_HOST:-$DATABASE_HOST}"
MAS_DB_HOST="${MAS_DATABASE_HOST:-$DATABASE_HOST}"

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

echo "🔍 Detected environment: $ENVIRONMENT"
echo "   Database Host: $DATABASE_HOST"
echo "   Synapse DB: $SYNAPSE_DB_NAME on $SYNAPSE_DB_HOST"
echo "   MAS DB: $MAS_DB_NAME on $MAS_DB_HOST"
echo ""

# Safety confirmation for production
if [ "$ENVIRONMENT" = "production" ]; then
    echo "⚠️  WARNING: You are about to backup PRODUCTION databases!"
    echo "   This is safe (read-only operation) but please confirm:"
    read -p "Continue with production backup? (yes/no): " confirmation
    if [ "$confirmation" != "yes" ]; then
        echo "❌ Backup cancelled"
        exit 1
    fi
fi

# Create backups directory if it doesn't exist
mkdir -p backups

# Generate timestamp
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

# Check if Matrix Synapse database exists
echo "🔍 Checking if Matrix Synapse database exists..."
SYNAPSE_EXISTS=$(PGPASSWORD=$DATABASE_PASSWORD psql -h $SYNAPSE_DB_HOST -U $DATABASE_USERNAME -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$SYNAPSE_DB_NAME';" 2>/dev/null)

if [ "$SYNAPSE_EXISTS" = "1" ]; then
    # Backup Matrix Synapse database
    SYNAPSE_BACKUP_FILE="backups/synapse_backup-$SYNAPSE_DB_HOST-$SYNAPSE_DB_NAME-$TIMESTAMP.sql"
    echo "📦 Backing up Matrix Synapse database to $SYNAPSE_BACKUP_FILE"
    PGPASSWORD=$DATABASE_PASSWORD pg_dump \
        --no-password \
        --verbose \
        --no-privileges \
        --no-owner \
        --serializable-deferrable \
        -h $SYNAPSE_DB_HOST \
        -U $DATABASE_USERNAME \
        -d $SYNAPSE_DB_NAME > $SYNAPSE_BACKUP_FILE

    if [ $? -eq 0 ]; then
        echo "✅ Matrix Synapse database backup completed successfully"
        echo "   File: $SYNAPSE_BACKUP_FILE"
        echo "   Size: $(du -h $SYNAPSE_BACKUP_FILE | cut -f1)"
        SYNAPSE_BACKED_UP=true
    else
        echo "❌ Matrix Synapse database backup failed!"
        exit 1
    fi
else
    echo "⚠️  Matrix Synapse database '$SYNAPSE_DB_NAME' does not exist - skipping"
    SYNAPSE_BACKED_UP=false
fi

# Check if MAS database exists
echo "🔍 Checking if MAS database exists..."
MAS_EXISTS=$(PGPASSWORD=${MAS_DATABASE_PASSWORD:-$DATABASE_PASSWORD} psql -h $MAS_DB_HOST -U $DATABASE_USERNAME -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$MAS_DB_NAME';" 2>/dev/null)

if [ "$MAS_EXISTS" = "1" ]; then
    # Backup MAS database
    MAS_BACKUP_FILE="backups/mas_backup-$MAS_DB_HOST-$MAS_DB_NAME-$TIMESTAMP.sql"
    echo "📦 Backing up MAS database to $MAS_BACKUP_FILE"
    PGPASSWORD=${MAS_DATABASE_PASSWORD:-$DATABASE_PASSWORD} pg_dump \
        --no-password \
        --verbose \
        --no-privileges \
        --no-owner \
        --serializable-deferrable \
        -h $MAS_DB_HOST \
        -U $DATABASE_USERNAME \
        -d $MAS_DB_NAME > $MAS_BACKUP_FILE

    if [ $? -eq 0 ]; then
        echo "✅ MAS database backup completed successfully"
        echo "   File: $MAS_BACKUP_FILE"
        echo "   Size: $(du -h $MAS_BACKUP_FILE | cut -f1)"
        MAS_BACKED_UP=true
    else
        echo "❌ MAS database backup failed!"
        exit 1
    fi
else
    echo "⚠️  MAS database '$MAS_DB_NAME' does not exist - skipping"
    MAS_BACKED_UP=false
fi

echo ""
echo "🎉 Database backup process completed!"

# Show summary of what was backed up
if [ "$SYNAPSE_BACKED_UP" = true ] && [ "$MAS_BACKED_UP" = true ]; then
    echo "   ✅ Matrix Synapse: $SYNAPSE_BACKUP_FILE"
    echo "   ✅ MAS: $MAS_BACKUP_FILE"
elif [ "$SYNAPSE_BACKED_UP" = true ]; then
    echo "   ✅ Matrix Synapse: $SYNAPSE_BACKUP_FILE"
    echo "   ⚠️  MAS: Database not found - skipped"
elif [ "$MAS_BACKED_UP" = true ]; then
    echo "   ⚠️  Matrix Synapse: Database not found - skipped"
    echo "   ✅ MAS: $MAS_BACKUP_FILE"
else
    echo "   ⚠️  No databases found to backup"
    exit 1
fi

echo ""
echo "💡 To restore these backups:"
echo "   • ./scripts/restore-matrix-mas-dbs.sh $TIMESTAMP"