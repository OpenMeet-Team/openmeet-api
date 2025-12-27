# OpenMeet API

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

The backend API powering [OpenMeet](https://platform.openmeet.net) — a **free, open-source event platform** for community organizers. Think Meetup, but free for communities and open source.

* **Platform:** [platform.openmeet.net](https://platform.openmeet.net)
* **API:** [api.openmeet.net](https://api.openmeet.net)
* **API Docs:** [api.openmeet.net/docs](https://api.openmeet.net/docs) (Swagger/OpenAPI)

**[What is OpenMeet? →](ROADMAP.md)** — Features, roadmap, and how to contribute

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | NestJS + TypeScript |
| Database | PostgreSQL (multi-tenant via schemas) |
| Cache | Redis |
| Queue | RabbitMQ |
| Auth | JWT + OAuth (ATprotocol/Bluesky, Google, GitHub) |
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
There are 2 docker compose files that could be merged into one to run the whole thing on a single server.
It is not resource intensive.

*This section is incomplete presently. Do not be surprised if there are missing things you'll need to trace down. Please leave an issue for us if you do, thanks!*

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

See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for complete local development instructions including:
- Quick start with Docker Compose
- Services overview with ports
- Debugging tools (psql, logs)
- Troubleshooting guide

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
npm run test

# Run specific test file
npm run test -- path/to/file.spec.ts

# E2E tests (requires running API, database, matrix to succeed)
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
├── pg-init-scripts/     # PostgreSQL init (PostGIS, Synapse DB, MAS DB)
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

Please review our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

---

## Community

- **OpenMeet:** [OpenMeet Guides Group](https://platform.openmeet.net/groups/openmeet-guides-gy5j8w) — Community meetups
- **Discord:** [discord.gg/eQcYADgnrc](https://discord.gg/eQcYADgnrc)
- **Bluesky:** [@openmeet.net](https://bsky.app/profile/openmeet.net)

---

## Support OpenMeet

OpenMeet is free for community groups, funded by the community. Help cover hosting costs (~$350/month) at [platform.openmeet.net/support](https://platform.openmeet.net/support).

---

## License

[Apache 2.0](LICENSE)
