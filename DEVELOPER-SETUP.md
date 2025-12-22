# Local Development Setup Guide

This guide explains how to run the full OpenMeet stack locally using Docker Compose.

## Quick Start

```bash
# 1. Copy the env file
cp env-example-relational .env

# 2. Install dependencies locally (required for tests and IDE support)
npm install

# 3. Start all services (migrations and seeds run automatically)
docker compose -f docker-compose-dev.yml up -d

# 4. Verify API is running (wait ~2 min for migrations to complete)
curl http://localhost:3000/health/liveness
# Expected: {"status":"ok","info":{"api":{"status":"up"}}}

# 5. Run tests to verify setup
npm run test                                       # Unit tests (~30s)
npm run test:e2e -- --testPathPattern="auth.e2e"  # Auth e2e tests (~15s)
```

## Services Overview

| Service | Port | Description |
|---------|------|-------------|
| api | [3000](http://localhost:3000/api/) and [api docs](http://localhost:3000/docs/)  | OpenMeet API (NestJS) |
| postgres | 5432 | PostgreSQL with PostGIS |
| redis | 6379 | Cache and session store |
| rabbitmq | 5672, [15672](http://localhost:15672) | Message queue (mgmt UI) |
| matrix | 8448 | Matrix Synapse homeserver |
| matrix-auth-service | [8081](http://localhost:8081) | MAS (Matrix Authentication Service) |
| maildev | 1025, [1080](http://localhost:1080) | Email testing (UI) |
| pgadmin | [8080](http://localhost:8080) | Database admin UI |
| tracing | [16686](http://localhost:16686) | Jaeger tracing UI |

## Customizing Your Environment

### Connecting to Dev/Prod Services

To point at dev/prod Matrix, Bluesky, etc., edit `.env` and update:

```bash
# Point at dev Matrix instead of local
MATRIX_HOMESERVER_URL=https://matrix.dev.openmeet.net
MATRIX_SERVER_NAME=matrix.openmeet.net

# Use dev MAS
MAS_ISSUER=https://mas.dev.openmeet.net/
MAS_PUBLIC_BASE=https://mas.dev.openmeet.net
```

### Enabling Bluesky Integration

The Bluesky services (firehose-consumer, event-processor) need:

```bash
BSKY_API_KEY=your-api-key
BSKY_TENANT_ID=your-tenant-id
```

### Using Real Email (SES)

Replace the maildev config:

```bash
MAIL_HOST=email-smtp.us-east-1.amazonaws.com
MAIL_PORT=465
MAIL_USER=your-smtp-user
MAIL_PASSWORD=your-smtp-password
MAIL_SECURE=true
```

## Troubleshooting

### Config Renderer Fails

Check logs:
```bash
docker logs openmeet_config_renderer
```

Common issues:
- Missing environment variable - add it to `.env`
- Template syntax error - check `matrix-config/*.gomplate.yaml`

### Matrix Services Won't Start

Matrix depends on config-renderer completing successfully:
```bash
# Check if configs were generated
docker exec openmeet_config_renderer ls /rendered-config/
```

### Database Connection Issues

Ensure postgres is healthy:
```bash
docker compose -f docker-compose-dev.yml ps postgres
```

## Debugging Tools

```bash
# psql into local database
docker exec -it openmeet_postgres psql -U root -d api

# View logs
docker compose -f docker-compose-dev.yml logs -f api

# Check container status
docker compose -f docker-compose-dev.yml ps
```

## Environment Variables Reference

See `env-example-relational` for all available variables. Key sections:

- **Database**: `DATABASE_*` - PostgreSQL connection
- **Redis**: `ELASTICACHE_*` - Cache configuration
- **Matrix**: `MATRIX_*`, `MAS_*`, `SYNAPSE_*` - Matrix/MAS configuration
- **OAuth**: `OAUTH_*` - OAuth provider for MAS upstream auth
- **Appservice**: `MATRIX_APPSERVICE_*` - Bot configuration
