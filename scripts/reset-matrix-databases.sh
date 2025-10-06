#!/bin/bash

# Reset Matrix and MAS Databases Script
# Usage: ./reset-matrix-databases.sh <host> <port> <user> <password> <synapse_db> <mas_db>

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -ne 6 ]; then
    echo -e "${RED}Error: Wrong number of arguments${NC}"
    echo
    echo "Usage: $0 <host> <port> <user> <password> <synapse_db> <mas_db>"
    echo
    echo "Examples:"
    echo "  $0 localhost 5432 root secret synapse mas"
    echo "  $0 db.example.com 5432 admin mypassword synapse-dev mas-dev"
    exit 1
fi

DB_HOST="$1"
DB_PORT="$2"
DB_USER="$3"
DB_PASSWORD="$4"
SYNAPSE_DB="$5"
MAS_DB="$6"

echo -e "${BLUE}=== OpenMeet Matrix Database Reset Script ===${NC}"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo
echo -e "${YELLOW}⚠️  WARNING: This will completely wipe the following databases:${NC}"
echo -e "   • ${RED}${SYNAPSE_DB}${NC} (Matrix/Synapse database)"
echo -e "   • ${RED}${MAS_DB}${NC} (Matrix Authentication Service database)"
echo

# Confirmation prompt
read -p "Are you sure you want to continue? (type 'yes' to confirm): " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo -e "${YELLOW}Operation cancelled.${NC}"
    exit 0
fi

echo

# Function to execute SQL commands
execute_sql() {
    local sql="$1"
    local description="$2"
    
    echo "   ${description}..."
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "$sql" >/dev/null 2>&1; then
        echo -e "${GREEN}   ✓ ${description} completed${NC}"
        return 0
    else
        echo -e "${RED}   ✗ ${description} failed${NC}"
        return 1
    fi
}

# Function to execute SQL on specific database
execute_sql_on_db() {
    local database="$1"
    local sql="$2"
    local description="$3"
    
    echo "   ${description}..."
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$database" -c "$sql" >/dev/null 2>&1; then
        echo -e "${GREEN}   ✓ ${description} completed${NC}"
        return 0
    else
        echo -e "${RED}   ✗ ${description} failed${NC}"
        return 1
    fi
}

# Test database connection
echo -e "${BLUE}1. Testing database connection...${NC}"
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    exit 1
fi

# Reset databases
echo -e "${BLUE}2. Resetting databases...${NC}"

# Terminate active connections to the databases
echo "   Terminating active connections..."
execute_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$SYNAPSE_DB' AND pid <> pg_backend_pid();" "Terminating connections to $SYNAPSE_DB"
execute_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$MAS_DB' AND pid <> pg_backend_pid();" "Terminating connections to $MAS_DB"

# Drop databases if they exist
echo "   Dropping existing databases..."
execute_sql "DROP DATABASE IF EXISTS \"$SYNAPSE_DB\";" "Dropping $SYNAPSE_DB database"
execute_sql "DROP DATABASE IF EXISTS \"$MAS_DB\";" "Dropping $MAS_DB database"

# Recreate databases
echo "   Creating fresh databases..."
execute_sql "CREATE DATABASE \"$SYNAPSE_DB\" OWNER \"$DB_USER\";" "Creating $SYNAPSE_DB database"
execute_sql "CREATE DATABASE \"$MAS_DB\" OWNER \"$DB_USER\";" "Creating $MAS_DB database"

# Initialize databases with permissions
echo "   Initializing Synapse database..."
SYNAPSE_INIT_SQL="
GRANT ALL PRIVILEGES ON DATABASE \"$SYNAPSE_DB\" TO \"$DB_USER\";
GRANT ALL ON SCHEMA public TO \"$DB_USER\";
"

execute_sql_on_db "$SYNAPSE_DB" "$SYNAPSE_INIT_SQL" "Initializing Synapse database"

echo "   Initializing MAS database..."
MAS_INIT_SQL="
GRANT ALL PRIVILEGES ON DATABASE \"$MAS_DB\" TO \"$DB_USER\";
GRANT ALL ON SCHEMA public TO \"$DB_USER\";
"

execute_sql_on_db "$MAS_DB" "$MAS_INIT_SQL" "Initializing MAS database"

# Verification
echo -e "${BLUE}3. Verifying database reset...${NC}"

for db in "$SYNAPSE_DB" "$MAS_DB"; do
    table_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
    
    if [ "$table_count" = "0" ]; then
        echo -e "${GREEN}   ✓ $db database is clean (0 tables)${NC}"
    else
        echo -e "${YELLOW}   ⚠️  $db database has $table_count tables${NC}"
    fi
done

echo
echo -e "${GREEN}🎉 Database reset completed successfully!${NC}"
echo
echo "Databases reset:"
echo "  • Synapse: $SYNAPSE_DB"
echo "  • MAS: $MAS_DB"
echo
echo -e "${GREEN}✓ Fresh Matrix and MAS databases are ready for use!${NC}"