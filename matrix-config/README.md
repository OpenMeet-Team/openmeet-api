# Matrix Server Configuration for OpenMeet

This directory contains configuration files for the Matrix chat server used in OpenMeet. The setup is designed to work consistently across both local Docker development and Kubernetes deployments.

## Configuration Approach

We use a **gomplate template-based approach** for consistent configuration across environments:

1. **Template files** (`.gomplate.yaml`) contain `{{ .Env.VARIABLE }}` placeholders for all dynamic values
2. **Config renderer service** processes templates using gomplate and generates signing keys
3. **Rendered configs** are stored in shared volumes and mounted as read-only by Matrix and MAS services

This unified approach works for both:
- Local development with Docker Compose (using config-renderer service)
- CI testing with Docker Compose (using config-renderer service)  
- Kubernetes deployment with init containers

**Template files:**
- `homeserver-mas.gomplate.yaml` - Matrix Synapse configuration template
- `mas-config.gomplate.yaml` - Matrix Authentication Service configuration template
- `openmeet-appservice.gomplate.yaml` - OpenMeet Application Service configuration template

**Legacy files** (archived in `archive/` directory):
- Environment-specific files like `*-local.yaml`, `*-ci.yaml` are no longer used

## Environment Variables

Key variables used in both environments:

| Variable | Description | Default (Local) |
|----------|-------------|----------------|
| SYNAPSE_SERVER_NAME | Matrix server domain | matrix-local.openmeet.test |
| POSTGRES_HOST | Database hostname | postgres |
| POSTGRES_USER | Database username | root |
| POSTGRES_PASSWORD | Database password | secret |
| POSTGRES_DB | Database name | synapse |
| SYNAPSE_REGISTRATION_SHARED_SECRET | Used for registering users | local_test_registration_secret |
| SYNAPSE_MACAROON_SECRET_KEY | Auth token secret | local_dev_macaroon_secret_key |
| SYNAPSE_FORM_SECRET | Form secret | local_dev_form_secret |

## Local Development Setup

1. **Config Generation**: The `config-renderer` service automatically:
   - Downloads and installs gomplate
   - Generates RSA and EC signing keys for MAS
   - Processes all `.gomplate.yaml` templates with environment variables
   - Stores rendered configs in the `matrix-configs` volume

2. **Start services**: Start the Matrix stack using Docker Compose:
   ```bash
   docker-compose -f docker-compose-dev.yml up -d config-renderer matrix-auth-service matrix
   ```

3. **Check config generation**:
   ```bash
   docker-compose -f docker-compose-dev.yml logs config-renderer
   ```

4. **Monitor Matrix startup**:
   ```bash
   docker-compose -f docker-compose-dev.yml logs matrix
   ```

5. **Verify services are healthy**:
   ```bash
   docker-compose -f docker-compose-dev.yml ps
   ```

The config-renderer service will stay running to keep the rendered configs available for Matrix and MAS services.

## Kubernetes Deployment

The Kubernetes deployment in `/openmeet-infrastructure/k8s/matrix/` follows the same pattern:

1. ConfigMap contains the template homeserver.yaml
2. Init container runs envsubst to process the template 
3. Environment variables come from ConfigMap and Secrets

## Troubleshooting

### Invalid Server Name Error

If you see `Invalid server name '${SYNAPSE_SERVER_NAME}'`, this means:
- Environment variable substitution failed
- Check that `envsubst` is installed in the container
- Verify Docker Compose environment variables are correct

### Database Connection Issues

If Matrix can't connect to the database:
- Check POSTGRES_* variables  
- Make sure postgres service is running
- Verify network connectivity between containers

## Resetting User Credentials

If you encounter authentication errors like `M_UNKNOWN_TOKEN` or `Invalid access token passed`, you can:

1. Directly in your database, reset user Matrix credentials:
   ```sql
   UPDATE "user" SET matrix_user_id = NULL, matrix_access_token = NULL, matrix_device_id = NULL;
   ```


2. The next time users interact with chat features, new credentials will be provisioned automatically.

## Clearing Matrix Data

To completely reset the Matrix data:

1. Stop any running containers:
   ```
   docker-compose -f docker-compose-dev.yml down
   ```

2. Remove the volume:
   ```
   docker volume rm openmeet-api_matrix-data
   ```

3. Start again:
   ```
   docker-compose -f docker-compose-dev.yml up -d
   ```

## Production Reset Plan

For the production/dev environment, the reset process is:

1. Backup the current Matrix configuration (but not user data)
2. Scale down the Matrix StatefulSet in Kubernetes
3. Delete the PersistentVolumeClaim for Matrix
4. Scale the service back up with a new PVC
5. Re-run initialization

Your Matrix admin credentials will change, so update them in your environment variables.