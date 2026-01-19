-- Create PLC database for CI (isolated DID registration)
CREATE DATABASE plc;

-- Grant permissions to the root user (our DATABASE_USERNAME)
\c plc;
GRANT ALL PRIVILEGES ON DATABASE plc TO root;

-- PLC server will handle its own schema creation on startup
