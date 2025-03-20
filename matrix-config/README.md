# Matrix Server Configuration for OpenMeet

This directory contains configuration files for the Matrix chat server used in OpenMeet. The setup is designed to work consistently across both local Docker development and Kubernetes deployments.

## Configuration Approach

We use a template-based approach with environment variables:

1. `homeserver.yaml` serves as a template with `${VARIABLE}` placeholders
2. The `start-matrix.sh` script processes this template using `envsubst`
3. The processed config file is written to a separate directory

This approach works for both:
- Local development with Docker Compose
- Kubernetes deployment with init containers

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

1. Start the Matrix server using Docker Compose:
   ```
   docker-compose -f docker-compose-dev.yml up -d matrix
   ```

2. After startup, check the logs to find the admin access token:
   ```
   docker-compose -f docker-compose-dev.yml logs matrix | grep -A 10 "Success! Matrix server initialized"
   ```

3. Add the access token to your `.env` file:
   ```
   MATRIX_ADMIN_ACCESS_TOKEN=your_token_from_logs
   MATRIX_ADMIN_USER=@admin:matrix-local.openmeet.test
   ```

4. Start your API server and it will connect to the local Matrix server.

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