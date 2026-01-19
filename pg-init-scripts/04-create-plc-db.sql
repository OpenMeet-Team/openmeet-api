-- Create PLC database for isolated DID registration (used with --profile pds)
CREATE DATABASE plc;

-- Grant permissions to the root user (our DATABASE_USERNAME)
\c plc;
GRANT ALL PRIVILEGES ON DATABASE plc TO root;

-- PLC server will handle its own schema creation on startup via ENABLE_MIGRATIONS=true
