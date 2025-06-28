# Matrix Authentication Service (MAS) Deployment Integration

## Overview

This document provides specific deployment configurations for integrating Matrix Authentication Service (MAS) into OpenMeet's existing Docker Compose and CI infrastructure, following established patterns used for Matrix Synapse and other services.

## Current Infrastructure Analysis

Based on analysis of the OpenMeet codebase:

- **Local Development**: `docker-compose-dev.yml` with Matrix Synapse v1.132.0
- **CI Testing**: `docker-compose.relational.ci.yaml` with custom Matrix Docker images
- **GitHub Actions**: E2E testing with Matrix OIDC flows
- **Kubernetes**: Automated deployments with persistent volumes and ingress

## 1. Local Development Integration

### Docker Compose Configuration

**Add to `openmeet-api/docker-compose-dev.yml`:**

```yaml
  # Matrix Authentication Service
  matrix-auth-service:
    image: ghcr.io/element-hq/matrix-authentication-service:latest
    container_name: openmeet_mas
    ports:
      - "8081:8080"
    environment:
      MAS_CONFIG: /data/config.yaml
    volumes:
      - ./matrix-config/mas-config-local.yaml:/data/config.yaml:ro
      - mas-data:/data
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - api-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  # Update existing Matrix service for MAS integration
  matrix:
    image: matrixdotorg/synapse:v1.132.0
    container_name: openmeet_matrix
    ports:
      - "8448:8448"
      - "9090:9090"
    environment:
      SYNAPSE_SERVER_NAME: "${MATRIX_SERVER_NAME:-matrix.openmeet.net}"
      SYNAPSE_REPORT_STATS: "no"
      SYNAPSE_LOG_LEVEL: "INFO"
      POSTGRES_HOST: postgres
      POSTGRES_USER: "${DATABASE_USERNAME}"
      POSTGRES_PASSWORD: "${DATABASE_PASSWORD}"
      POSTGRES_DB: "synapse"
      # MAS integration
      MAS_ISSUER: "http://matrix-auth-service:8080/"
      MAS_CLIENT_SECRET: "${MAS_CLIENT_SECRET}"
    volumes:
      - ./matrix-config/homeserver-mas-local.yaml:/data/homeserver.yaml:ro
      - ./matrix-config/log.config:/data/log.config:ro
      - ./matrix-config/signing.key:/data/signing.key:ro
      - matrix-data:/data/media
    depends_on:
      postgres:
        condition: service_healthy
      matrix-auth-service:
        condition: service_healthy
    networks:
      - api-network

volumes:
  mas-data:
    driver: local
```

### MAS Configuration for Local Development

**Create `openmeet-api/matrix-config/mas-config-local.yaml`:**

```yaml
http:
  listeners:
    - name: web
      binds:
        - address: "[::]:8080"
      resources:
        - name: discovery
        - name: human
        - name: oauth
        - name: compat
        - name: graphql
        - name: assets
  public_base: "http://localhost:8081"
  trusted_proxies: []

database:
  uri: "postgresql://postgres:password@postgres:5432/mas"
  max_connections: 10
  min_connections: 0

secrets:
  encryption: "local-dev-encryption-key-32-chars"
  keys:
    - kid: "local-key-1"
      key: "local-dev-signing-key-for-jwt-tokens"

matrix:
  homeserver: "http://matrix:8448"
  secret: "local-dev-shared-secret-with-synapse"
  endpoint: "http://localhost:8081"

upstream_oauth2:
  providers:
    - id: "01JAYS74TCG3BTWKADN5Q4518C"
      human_name: "OpenMeet Local"
      brand_name: "openmeet"
      issuer: "http://api:3000/api/oidc"
      client_id: "mas_client"
      client_secret: "mas-local-client-secret"
      scope: "openid profile email"
      claims_imports:
        localpart:
          action: require
          template: "{{ user.preferred_username }}"
        displayname:
          action: suggest
          template: "{{ user.name }}"
        email:
          action: suggest
          template: "{{ user.email }}"
        tenant_id:
          action: suggest
          template: "{{ user.tenant_id or 'default' }}"

policy:
  wasm_module: "/usr/local/share/mas-cli/policy.wasm"
  data:
    admin_users: []

branding:
  service_name: "OpenMeet Authentication"
  policy_uri: "https://openmeet.net/privacy"
  tos_uri: "https://openmeet.net/terms"

email:
  from: "noreply@openmeet.net"
  reply_to: "noreply@openmeet.net"
  transport: "smtp"
  hostname: "maildev"
  port: 1025
  mode: "plain"

telemetry:
  tracing:
    jaeger:
      endpoint: "http://jaeger:14268/api/traces"
  metrics:
    prometheus:
      enabled: true
      bind: "[::]:9090"
```

### Updated Synapse Configuration

**Create `openmeet-api/matrix-config/homeserver-mas-local.yaml`:**

```yaml
server_name: "${SYNAPSE_SERVER_NAME}"
public_baseurl: "http://localhost:8448"
pid_file: /data/homeserver.pid
web_client_location: "http://localhost:9005"

listeners:
  - port: 8448
    tls: false
    type: http
    x_forwarded: true
    bind_addresses: ['0.0.0.0']
    resources:
      - names: [client, federation, metrics]
        compress: false

database:
  name: psycopg2
  args:
    user: "${POSTGRES_USER}"
    password: "${POSTGRES_PASSWORD}"
    database: "synapse"
    host: "${POSTGRES_HOST}"
    port: "5432"
    cp_min: 5
    cp_max: 10

# MSC3861 - Delegate authentication to MAS
experimental_features:
  msc3861:
    enabled: true
    issuer: "${MAS_ISSUER}"
    client_id: "0000000000000000000SYNAPSE"
    client_auth_method: "client_secret_basic"
    client_secret: "${MAS_CLIENT_SECRET}"
    admin_token: "local-mas-admin-token"

# Disable built-in authentication since MAS handles it
password_providers: []
enable_registration: false
registration_shared_secret: null

# Remove OIDC providers - MAS handles this now
oidc_providers: []

# Existing configuration
macaroon_secret_key: "your-secret-key-here"
form_secret: "your-form-secret-here"
signing_key_path: "/data/signing.key"

media_store_path: /data/media
uploads_path: /data/uploads
data_dir: /data

log_config: "/data/log.config"

federation_domain_whitelist: []
federation_ip_range_blacklist:
  - '127.0.0.0/8'
  - '10.0.0.0/8'
  - '172.16.0.0/12'
  - '192.168.0.0/16'

enable_metrics: true
report_stats: false

app_service_config_files: []

user_directory:
  enabled: true
  search_all_users: false
  prefer_local_users: true

# Room and user limits
max_upload_size: "50M"
url_preview_enabled: false
```

## 2. CI Testing Integration

### Docker Compose for CI

**Update `openmeet-api/docker-compose.relational.ci.yaml`:**

```yaml
services:
  # Add MAS service for CI testing
  matrix-auth-service:
    image: ghcr.io/element-hq/matrix-authentication-service:latest
    expose:
      - 8080
    environment:
      MAS_CONFIG: /data/config.yaml
    volumes:
      - ./matrix-config/mas-config-ci.yaml:/data/config.yaml:ro
    depends_on:
      postgres:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  # Update existing Matrix service
  matrix:
    build:
      context: .
      dockerfile: matrix.mas.ci.Dockerfile
    expose:
      - 8448
    ports:
      - "8448:8448"
    environment:
      SYNAPSE_SERVER_NAME: ${MATRIX_SERVER_NAME:-matrix-ci.openmeet.test}
      SYNAPSE_REPORT_STATS: "no"
      SYNAPSE_LOG_LEVEL: "INFO"
      POSTGRES_HOST: postgres
      POSTGRES_USER: ${DATABASE_USERNAME}
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
      POSTGRES_DB: "synapse"
      MAS_ISSUER: "http://matrix-auth-service:8080/"
      MAS_CLIENT_SECRET: "ci-mas-client-secret"
    depends_on:
      api:
        condition: service_healthy
      matrix-auth-service:
        condition: service_healthy
      postgres:
        condition: service_started
```

### CI-Specific MAS Configuration

**Create `openmeet-api/matrix-config/mas-config-ci.yaml`:**

```yaml
http:
  listeners:
    - name: web
      binds:
        - address: "[::]:8080"
      resources:
        - name: discovery
        - name: human
        - name: oauth
        - name: compat
  public_base: "http://matrix-auth-service:8080"

database:
  uri: "postgresql://postgres:password@postgres:5432/mas_ci"
  max_connections: 5
  min_connections: 0

secrets:
  encryption: "ci-test-encryption-key-32-chars-here"
  keys:
    - kid: "ci-key-1"
      key: "ci-test-signing-key-for-jwt-tokens"

matrix:
  homeserver: "http://matrix:8448"
  secret: "ci-shared-secret-with-synapse"
  endpoint: "http://matrix-auth-service:8080"

upstream_oauth2:
  providers:
    - id: "openmeet-ci"
      human_name: "OpenMeet CI"
      brand_name: "openmeet"
      issuer: "http://api:3000/api/oidc"
      client_id: "mas_client_ci"
      client_secret: "mas-ci-client-secret"
      scope: "openid profile email"
      claims_imports:
        localpart:
          action: require
          template: "{{ user.preferred_username }}"
        displayname:
          action: suggest
          template: "{{ user.name }}"
        email:
          action: suggest
          template: "{{ user.email }}"

policy:
  wasm_module: "/usr/local/share/mas-cli/policy.wasm"

email:
  from: "noreply@ci.openmeet.test"
  transport: "blackhole"  # Don't send emails in CI

telemetry:
  tracing:
    enabled: false  # Disable tracing in CI for performance
  metrics:
    enabled: false
```

### CI Docker Image

**Create `openmeet-api/matrix.mas.ci.Dockerfile`:**

```dockerfile
FROM matrixdotorg/synapse:v1.132.0

# Install curl for health checks and envsubst for template processing
RUN apt-get update && \
    apt-get install -y curl gettext-base && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy MAS-compatible configuration templates
COPY matrix-config/homeserver-mas-ci.yaml /data/homeserver.yaml.template
COPY matrix-config/log.config /data/log.config
COPY matrix-config/start-matrix-mas-ci.sh /data/start-matrix.sh

# Make scripts executable
RUN chmod +x /data/start-matrix.sh

# Create required directories
RUN mkdir -p /data/media /data/uploads

ENTRYPOINT ["/bin/bash", "/data/start-matrix.sh"]
```

### CI Startup Script

**Create `openmeet-api/matrix-config/start-matrix-mas-ci.sh`:**

```bash
#!/bin/bash
set -e

echo "Starting Matrix Synapse with MAS integration for CI..."

# Process configuration template with environment variables
envsubst < /data/homeserver.yaml.template > /data/homeserver.yaml

# Generate signing key if it doesn't exist
if [ ! -f /data/signing.key ]; then
    echo "Generating Matrix signing key..."
    /usr/local/bin/generate_signing_key.py -o /data/signing.key
fi

# Wait for MAS to be healthy
echo "Waiting for MAS to be ready..."
until curl -f http://matrix-auth-service:8080/health; do
    echo "MAS not ready, waiting..."
    sleep 2
done
echo "MAS is ready!"

# Start Synapse
echo "Starting Synapse..."
exec /usr/local/bin/python -m synapse.app.homeserver \
    --config-path=/data/homeserver.yaml \
    --generate-keys
```

### CI Synapse Configuration

**Create `openmeet-api/matrix-config/homeserver-mas-ci.yaml`:**

```yaml
server_name: "${SYNAPSE_SERVER_NAME}"
public_baseurl: "http://matrix:8448"
pid_file: /data/homeserver.pid

listeners:
  - port: 8448
    tls: false
    type: http
    x_forwarded: true
    bind_addresses: ['0.0.0.0']
    resources:
      - names: [client, federation, metrics]
        compress: false

database:
  name: psycopg2
  args:
    user: "${POSTGRES_USER}"
    password: "${POSTGRES_PASSWORD}"
    database: "synapse"
    host: "${POSTGRES_HOST}"
    port: "5432"
    cp_min: 2
    cp_max: 5

# MSC3861 - Delegate authentication to MAS
experimental_features:
  msc3861:
    enabled: true
    issuer: "${MAS_ISSUER}"
    client_id: "0000000000000000000SYNAPSE"
    client_auth_method: "client_secret_basic"
    client_secret: "${MAS_CLIENT_SECRET}"
    admin_token: "ci-mas-admin-token"

# Disable built-in authentication
password_providers: []
enable_registration: false
registration_shared_secret: null
oidc_providers: []

# CI-optimized settings
macaroon_secret_key: "ci-test-macaroon-secret-key"
form_secret: "ci-test-form-secret"
signing_key_path: "/data/signing.key"

media_store_path: /data/media
uploads_path: /data/uploads
data_dir: /data

log_config: "/data/log.config"

# Disable federation for CI
federation_domain_whitelist: []
send_federation: false
federation_ip_range_blacklist:
  - '0.0.0.0/0'

enable_metrics: false
report_stats: false

user_directory:
  enabled: false

max_upload_size: "10M"
url_preview_enabled: false
```

## 3. Database Setup

### PostgreSQL Initialization

**Update `openmeet-api/pg-init-scripts/03-create-mas-db.sql`:**

```sql
-- Create MAS databases for local and CI
CREATE DATABASE mas;
CREATE DATABASE mas_ci;

-- Grant permissions to the postgres user
\c mas;
GRANT ALL PRIVILEGES ON DATABASE mas TO postgres;

\c mas_ci;
GRANT ALL PRIVILEGES ON DATABASE mas_ci TO postgres;

-- Create schema and initial MAS tables will be created by MAS on startup
\c mas;
-- MAS will handle its own schema creation

\c mas_ci;
-- MAS will handle its own schema creation
```

## 4. Environment Configuration

### Local Development Environment

**Add to `openmeet-api/.env`:**

```bash
# Matrix Authentication Service Configuration
MAS_DATABASE_URL=postgresql://postgres:password@localhost:5432/mas
MAS_ENCRYPTION_KEY=local-dev-encryption-key-32-chars
MAS_SIGNING_KEY=local-dev-signing-key-for-jwt-tokens
MAS_CLIENT_SECRET=local-dev-shared-secret-with-synapse
MAS_PUBLIC_URL=http://localhost:8081
MAS_ISSUER=http://localhost:8081/

# Matrix Synapse MSC3861 Configuration
MATRIX_MAS_ISSUER=http://matrix-auth-service:8080/
MATRIX_MAS_CLIENT_SECRET=local-dev-shared-secret-with-synapse
```

### CI Environment Variables

**Add to `openmeet-api/env-example-relational-ci`:**

```bash
# MAS Configuration for CI
MAS_DATABASE_URL=postgresql://postgres:password@postgres:5432/mas_ci
MAS_ENCRYPTION_KEY=ci-test-encryption-key-32-chars-here
MAS_SIGNING_KEY=ci-test-signing-key-for-jwt-tokens
MAS_CLIENT_SECRET=ci-mas-client-secret
MAS_ISSUER=http://matrix-auth-service:8080/

# Matrix Configuration for CI
MATRIX_SERVER_NAME=matrix-ci.openmeet.test
MATRIX_MAS_ISSUER=http://matrix-auth-service:8080/
MATRIX_MAS_CLIENT_SECRET=ci-mas-client-secret
```

## 5. GitHub Actions Integration

### Updated Workflow

**Modify `.github/workflows/deploy-to-dev.yml`:**

```yaml
  e2e-test:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # Pre-pull MAS image for faster CI startup
      - name: Pre-pull Matrix Authentication Service image
        run: |
          docker pull ghcr.io/element-hq/matrix-authentication-service:latest
          docker pull matrixdotorg/synapse:v1.132.0

      - name: Start services and run e2e tests with MAS
        id: e2e-tests
        run: |
          echo "Starting services with MAS integration..."
          docker compose -f docker-compose.relational.ci.yaml --env-file env-example-relational-ci -p ci-relational up --build --exit-code-from api

      - name: Copy logs from containers
        if: failure()
        run: |
          mkdir -p ./logs
          docker cp ci-relational-api-1:/usr/src/app/prod.log ./logs/api.log || true
          docker cp ci-relational-matrix-auth-service-1:/data/logs/mas.log ./logs/mas.log || true
          docker cp ci-relational-matrix-1:/data/homeserver.log ./logs/matrix.log || true
          docker logs ci-relational-matrix-auth-service-1 > ./logs/mas-container.log 2>&1 || true
          docker logs ci-relational-matrix-1 > ./logs/matrix-container.log 2>&1 || true

      - name: Upload logs for debugging
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: mas-integration-logs
          path: ./logs/
          retention-days: 7

      - name: Health check status
        if: failure()
        run: |
          echo "=== Service Health Status ==="
          docker compose -f docker-compose.relational.ci.yaml -p ci-relational ps
          echo "=== MAS Health Check ==="
          docker exec ci-relational-matrix-auth-service-1 curl -f http://localhost:8080/health || true
          echo "=== Matrix Health Check ==="
          docker exec ci-relational-matrix-1 curl -f http://localhost:8448/_matrix/client/versions || true
```

## 6. Testing Integration

### Updated E2E Tests

**Create `openmeet-api/test/oidc/mas-integration.e2e-spec.ts`:**

```typescript
import request from 'supertest';
import { TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

describe('MAS Integration E2E Tests', () => {
  let userToken: string;
  const MAS_BASE_URL = process.env.MAS_URL || 'http://localhost:8081';
  const MATRIX_BASE_URL = process.env.MATRIX_URL || 'http://localhost:8448';
  const API_BASE_URL = process.env.BACKEND_DOMAIN || 'http://localhost:3000';

  beforeAll(async () => {
    userToken = await loginAsTester();
    console.log('🔐 MAS Test setup complete with user token');
  });

  describe('MAS Authentication Flow', () => {
    it('should redirect to MAS for Matrix authentication', async () => {
      console.log('🚀 Testing MAS authentication redirect...');
      
      const response = await request(MATRIX_BASE_URL)
        .get('/_matrix/client/v3/login')
        .expect(200);

      expect(response.body.flows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'm.login.sso',
            identity_providers: expect.arrayContaining([
              expect.objectContaining({
                id: 'oidc',
                name: expect.any(String)
              })
            ])
          })
        ])
      );
    });

    it('should handle MAS discovery endpoint', async () => {
      console.log('🔍 Testing MAS OIDC discovery...');
      
      const response = await request(MAS_BASE_URL)
        .get('/.well-known/openid-configuration')
        .expect(200);

      expect(response.body).toMatchObject({
        issuer: expect.stringContaining(MAS_BASE_URL),
        authorization_endpoint: expect.stringContaining('/oauth2/auth'),
        token_endpoint: expect.stringContaining('/oauth2/token'),
        userinfo_endpoint: expect.stringContaining('/oauth2/userinfo'),
        jwks_uri: expect.stringContaining('/oauth2/keys')
      });
    });

    it('should authenticate user through MAS upstream OIDC', async () => {
      console.log('🔐 Testing MAS upstream OIDC authentication...');
      
      // Start OAuth flow with MAS
      const authResponse = await request(MAS_BASE_URL)
        .get('/oauth2/auth')
        .query({
          client_id: '0000000000000000000SYNAPSE',
          response_type: 'code',
          redirect_uri: `${MATRIX_BASE_URL}/_synapse/client/oidc/callback`,
          scope: 'openid profile email',
          state: 'test-state-123'
        })
        .expect(302);

      // Should redirect to OpenMeet OIDC for upstream authentication
      expect(authResponse.headers.location).toContain('/api/oidc/auth');
      
      const redirectUrl = new URL(authResponse.headers.location);
      expect(redirectUrl.searchParams.get('client_id')).toBeTruthy();
      expect(redirectUrl.searchParams.get('state')).toBeTruthy();
    });
  });

  describe('Matrix-MAS Integration', () => {
    it('should delegate Matrix authentication to MAS', async () => {
      console.log('🔗 Testing Matrix delegation to MAS...');
      
      // Try to access Matrix client API without authentication
      const response = await request(MATRIX_BASE_URL)
        .get('/_matrix/client/v3/account/whoami')
        .expect(401);

      // Should get error indicating MAS authentication required
      expect(response.body.errcode).toBe('M_MISSING_TOKEN');
    });

    it('should validate MAS tokens in Matrix', async () => {
      // This test would require completing the full OAuth flow
      // For now, we test that Matrix properly rejects invalid tokens
      console.log('🔍 Testing MAS token validation in Matrix...');
      
      const response = await request(MATRIX_BASE_URL)
        .get('/_matrix/client/v3/account/whoami')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.errcode).toBe('M_UNKNOWN_TOKEN');
    });
  });

  describe('MAS Health and Status', () => {
    it('should report healthy status', async () => {
      console.log('❤️ Testing MAS health endpoint...');
      
      const response = await request(MAS_BASE_URL)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy'
      });
    });

    it('should provide version information', async () => {
      console.log('📋 Testing MAS version endpoint...');
      
      const response = await request(MAS_BASE_URL)
        .get('/')
        .expect(200);

      // MAS should return some version or status information
      expect(response.text).toBeTruthy();
    });
  });
});
```

## 7. Migration Plan

### Phase 1: Parallel Deployment (Week 1-2)
1. Deploy MAS alongside current Synapse setup
2. Configure MAS with OpenMeet as upstream OIDC provider
3. Test MAS authentication flows independently
4. Verify database connectivity and health checks

### Phase 2: CI Integration (Week 2-3)
1. Update CI docker-compose to include MAS
2. Modify Matrix configuration for MSC3861 mode
3. Update E2E tests to use MAS authentication
4. Ensure all tests pass with new authentication flow

### Phase 3: Local Development (Week 3-4)
1. Update local docker-compose for MAS integration
2. Provide migration documentation for developers
3. Update development environment setup instructions
4. Test full local development workflow

### Phase 4: Production Deployment (Week 4-6)
1. Deploy MAS in Kubernetes development environment
2. Migrate users gradually with rollback capability
3. Monitor authentication flows and performance
4. Complete migration and remove legacy OIDC code

## Benefits of This Integration

1. **Follows Existing Patterns**: Uses same Docker Compose and CI patterns as current Matrix setup
2. **Minimal Disruption**: Parallel deployment allows testing without breaking current flows
3. **Standards Compliance**: Full OAuth2/OIDC implementation eliminates custom authentication code
4. **Better Testing**: More realistic authentication flows in CI environment
5. **Future-Proof**: Aligns with Matrix.org recommended authentication architecture

This deployment plan maintains compatibility with existing development and CI workflows while providing a clear path to modern Matrix authentication.