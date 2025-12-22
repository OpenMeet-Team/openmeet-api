# OpenMeet API

The backend API powering [OpenMeet](https://platform.openmeet.net) — a **free, open-source event platform** for community organizers. Think Meetup, but free for communities and open source.

* **Platform:** [platform.openmeet.net](https://platform.openmeet.net)
* **API:** [api.openmeet.net](https://api.openmeet.net)
* **API Docs:** [api.openmeet.net/api/docs](https://api.openmeet.net/api/docs) (Swagger/OpenAPI)

**[What is OpenMeet? →](ROADMAP.md)** — Features, roadmap, and how to contribute

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | NestJS + TypeScript |
| Database | PostgreSQL (multi-tenant via schemas) |
| Cache | Redis |
| Queue | RabbitMQ |
| Auth | JWT + OAuth (Bluesky, Google, GitHub) |
| Chat | Matrix (Synapse) |
| AT Protocol | @atproto/* packages |

### Related Repositories

| Repository | Description | Stack |
|------------|-------------|-------|
| [openmeet-api](https://github.com/OpenMeet-Team/openmeet-api) | Backend API (this repo) | NestJS, TypeScript, PostgreSQL |
| [openmeet-platform](https://github.com/OpenMeet-Team/openmeet-platform) | Frontend web app | Vue 3, Quasar, TypeScript |
| [survey](https://github.com/OpenMeet-Team/survey) | Survey/polling service | Go, Templ, HTMX |

---

## Operations

### Running Your Own Instance

OpenMeet can be self-hosted. The production deployment uses Kubernetes with ArgoCD GitOps.

### Prerequisites

| Service | Purpose |
|---------|---------|
| PostgreSQL 16+ | Primary database (with PostGIS extension) |
| Redis | Session cache and caching |
| RabbitMQ | Async event processing (Bluesky integration) |
| Matrix Synapse | Real-time chat (optional) |
| SMTP server | Email notifications |

### Environment Configuration

Copy the example environment file:
```bash
cp env-example-relational .env
```

Key configuration:
- `DATABASE_*` — PostgreSQL connection
- `REDIS_*` / `ELASTICACHE_*` — Redis connection
- `MAIL_*` — SMTP settings
- `BLUESKY_KEY_*` — AT Protocol OAuth keys (base64-encoded)
- `BACKEND_DOMAIN` — Public API URL

#### Tenant Configuration

OpenMeet is multi-tenant. Configure tenants via:
- `./config/tenants.json` file, or
- `TENANTS_B64` environment variable (base64-encoded JSON)

Example `tenants.json`:
```json
[
  {
    "id": "1",
    "name": "OpenMeet",
    "frontendDomain": "https://platform.openmeet.net",
    "mailDefaultEmail": "no-reply@openmeet.net",
    "mailDefaultName": "OpenMeet"
  }
]
```

#### Admin User

The admin user is created during database seeding using:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

---

## Development

### Prerequisites
- Node.js v22+
- Docker and Docker Compose
- PostgreSQL 16+ (or use Docker)

### Local Setup

**Option 1: Full Docker environment (recommended)**

This starts PostgreSQL, Redis, Matrix, RabbitMQ, and the API with hot reload:
```bash
# Copy example config
cp env-example-relational .env-local

# Start all services
docker compose -f docker-compose-dev.yml up --build

# API available at http://localhost:3000
# Swagger docs at http://localhost:3000/api/docs
```

**Option 2: API only (dependencies via Docker)**

```bash
# Start dependencies only
docker compose -f docker-compose-dev.yml up -d postgres redis maildev

# Configure environment
cp env-example-relational .env
export $(grep -v "#" ".env" | xargs)

# Install dependencies and run migrations
npm install
npm run migration:run:tenants
npm run seed:run:prod

# Start development server
npm run start:dev
```

### Database Migrations

```bash
# Run migrations for all tenants
npm run migration:run:tenants

# Reset database (dev only!)
npm run migration:reset
```

### Testing

```bash
# Unit tests
npm run test:local

# Run specific test file
npm run test -- path/to/file.spec.ts

# E2E tests (requires running API + database)
npm run test:e2e

# Type check
npx tsc --noEmit
```

Set `TEST_TENANT_ID` in `.env` for e2e tests.

### Project Structure

```
openmeet-api/
├── design-notes/        # Architecture and design documentation
├── grafana/             # Monitoring dashboards
├── matrix-config/       # Matrix/Synapse configuration templates
├── scripts/             # Utility scripts
├── test/                # E2E tests
└── src/                 # Application source code
    ├── auth*/           # Authentication (core, Bluesky, Google, GitHub)
    ├── event*/          # Events, attendees, series, permissions
    ├── group*/          # Groups, members, permissions
    ├── bluesky/         # AT Protocol client
    ├── matrix/          # Matrix chat integration
    ├── database/        # Migrations, seeds, data sources
    ├── tenant/          # Multi-tenant infrastructure
    └── ...              # Additional domain modules
```

---

## Contributing

We welcome contributions! Here's how to get started:

1. Check out our [good first issues](https://github.com/OpenMeet-Team/openmeet-api/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
2. Fork the repo and create a feature branch
3. Write tests for your changes
4. Submit a PR — we review within a few days

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the people who have helped build OpenMeet.

---

## Community

- **OpenMeet:** [OpenMeet Guides Group](https://platform.openmeet.net/groups/openmeet-guides-gy5j8w) — Community meetups
- **Discord:** [discord.gg/eQcYADgnrc](https://discord.gg/eQcYADgnrc)
- **Bluesky:** [@openmeet.net](https://bsky.app/profile/openmeet.net)

---

## Support OpenMeet

OpenMeet is free for community groups, funded by the community. Help cover hosting costs (~$350/month) at [platform.openmeet.net/support](https://platform.openmeet.net/support).
