# CLAUDE.md

This file provides guidance to Claude Code when working with the OpenMeet API.

## Project Overview

OpenMeet API is a NestJS-based multi-tenant backend for event management and community building. It integrates with the AT Protocol for decentralized identity, supports multiple OAuth providers, and provides real-time event streaming via RabbitMQ.

## Tech Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with TypeORM (multi-tenant via schemas)
- **Cache**: Redis/ElastiCache for sessions and caching
- **Queue**: RabbitMQ for async event processing
- **Auth**: JWT + multiple OAuth providers (AT Protocol/Bluesky, Google, GitHub)
- **AT Protocol**: @atproto/* packages for decentralized identity

## Terminology: AT Protocol Transition

**Long-term goal:** Transition from "Bluesky/bsky" terminology to "AT Protocol/atproto" terminology throughout the codebase.

**Why:** AT Protocol is the underlying decentralized protocol; Bluesky is just one application built on it. OpenMeet integrates with the protocol itself, not specifically with Bluesky the app. Using protocol-level terminology:
- Better reflects what we're actually integrating with
- Avoids confusion as other apps join the AT Protocol network
- Aligns with the @atproto/* packages we use

**When making changes:**
- **New code**: Use "atproto" or "AT Protocol" terminology (e.g., `atproto-auth`, `AtprotoService`)
- **Refactoring**: Take opportunities to rename `bluesky`/`bsky` → `atproto` when touching related code
- **Commits**: Use "atproto" in commit messages for new AT Protocol work
- **Don't**: Do wholesale renames just for terminology—combine with functional changes

**Current state** (to be migrated over time):
- `src/auth-bluesky/` → eventually `src/auth-atproto/`
- `src/bluesky/` → eventually `src/atproto/`
- `BLUESKY_KEY_*` env vars → eventually `ATPROTO_KEY_*`

## Development Commands

```bash
# For general development tasks, we use docker compose to run a full environment
# to manage just the api with live reloading

docker compose -f docker-compose-dev.yml  up --build -d api 
docker compose -f docker-compose-dev.yml logs api -f
docker compose -f docker-compose-dev.yml down api



# For Local development
# Start development server 
npm run start:dev # we generally use the docker setup above

# Run unit tests
npm run test:local

# Run specific test file
npm run test -- path/to/file.spec.ts

# run the full 15 minute e2e test suite, specify files to test if we can to improve spped
npm run test:e2e

# Lint and fix
npm run lint -- --fix

# Type check (no npm run typecheck available)
npx vue-tsc --noEmit   # Not applicable here - use tsc
npx tsc --noEmit

# Build
npm run build
```

### Database Commands

```bash

# we use .env to point at the correct database, linking .env-local to .env for local environments, but linking .env-dev or .env-prod when we need to update those envs.  maybe we need to transition this to a job that runs migrations in prod/dev instead of using my local host to do it

# Run migrations
ln -sf .env-local .env
npm run migration:run:tenants

# Reset database to empty (dev only)
npm run migration:reset

# Generate new migration
# get date stamp in nanoseconds
# create a src/database/migrations file and look at a few existing examples for the patterns to follow
```

## Architecture

```
design-notes/             # design docs to help us keep the project on track and steer long term development
grafana/                  # various dashboards that we use for grafana.  should probably move to infrastructure
test/                     # e2e tests for API and related services
src/
├── auth/                 # Core authentication
├── auth-bluesky/         # Bluesky OAuth integration
├── auth-google/          # Google OAuth
├── auth-github/          # GitHub OAuth
├── bluesky/              # Bluesky API client
├── event/                # Event management
├── event-series/         # Recurring events
├── event-attendee/       # RSVP management
├── group/                # Group/community management
├── user/                 # User profiles
├── tenant/               # Multi-tenant context
├── database/             # Migrations, seeds, data sources
└── core/                 # Shared decorators, guards, pipes
```

## Key Patterns

### Multi-Tenant Architecture
- Tenant context flows via `TenantConnectionService`
- Each tenant has separate PostgreSQL schema: `tenant_<id>`
- **Always pass tenantId** to service methods - missing it causes "Tenant ID is required" errors

### Service Pattern
```typescript
// Services use dependency injection
constructor(
  private readonly tenantService: TenantConnectionService,
  private readonly configService: ConfigService,
) {}

// Methods require tenantId
async findAll(tenantId: string) {
  const repo = await this.getRepository(tenantId);
  // ...
}
```

### Error Handling
- Use NestJS exceptions: `BadRequestException`, `NotFoundException`, etc.
- Log errors with context: `this.logger.error('message', { tenantId, userId })`

## Testing

- Unit tests: `*.spec.ts` alongside source files
- E2E tests: `test/` directory
- Run single file: `npm run test -- event.service.spec.ts`
- CI mode: `npm run test:ci` (limited workers)

### Testing OG Meta Tags (Link Previews)

OG meta tags are served by `src/meta/meta.controller.ts` for bot crawlers (Slack, Discord, etc.).

**Test locally with curl:**
```bash
# Events - note: /api/meta/ not /api/v1/meta/
curl -s -H "x-tenant-id: lsdfaopkljdfs" \
  "http://localhost:3000/api/meta/events/<event-slug>"

# Groups
curl -s -H "x-tenant-id: lsdfaopkljdfs" \
  "http://localhost:3000/api/meta/groups/<group-slug>"

# Event Series
curl -s -H "x-tenant-id: lsdfaopkljdfs" \
  "http://localhost:3000/api/meta/event-series/<series-slug>"
```

**Key points:**
- Path is `/api/meta/` (no `v1`)
- Requires `x-tenant-id` header (`lsdfaopkljdfs` for local, `openmeet` for dev/prod)
- Returns full HTML with OG tags - grep for `og:description` to verify
- In production, nginx routes bot User-Agents to these endpoints automatically

## Configuration

Environment files:
- `.env-local` - Local development
- `.env-dev` - Dev environment
- `.env-prod` - Production (secrets via k8s)

Key variables:
- `DATABASE_*` - PostgreSQL connection
- `REDIS_*` - ElastiCache connection
- `BLUESKY_KEY_*` - AT Protocol OAuth keys (base64 encoded, to be renamed ATPROTO_KEY_*)
- `BACKEND_DOMAIN` - Public API URL

## Common Issues

### "Tenant ID is required"
Background jobs or setTimeout callbacks losing tenant context. Ensure tenantId is passed explicitly.

### AT Protocol OAuth Failures (currently named "Bluesky")
Check BLUESKY_KEY_* environment variables (to be renamed ATPROTO_KEY_*). Keys must be base64-encoded PKCS#8 private keys.

### Migration Errors
Run both base and tenant migrations:
```bash
npm run migration:run && npm run migration:run:tenants
```

### Slug Short Code Regex
`generateShortCode()` uses nanoid's `urlAlphabet` which contains `A-Za-z0-9_-`. After `toLowerCase()`, slugs can have underscores and hyphens in the short code portion. Test regexes must use `[a-z0-9_-]+` not `[a-z0-9]+`.
