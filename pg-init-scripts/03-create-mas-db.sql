-- Create MAS databases for local and CI
CREATE DATABASE mas;
CREATE DATABASE mas_ci;

-- Grant permissions to the root user (our DATABASE_USERNAME)
\c mas;
GRANT ALL PRIVILEGES ON DATABASE mas TO root;

\c mas_ci;
GRANT ALL PRIVILEGES ON DATABASE mas_ci TO root;

-- Create schema and initial MAS tables will be created by MAS on startup
\c mas;
-- MAS will handle its own schema creation

\c mas_ci;
-- MAS will handle its own schema creation