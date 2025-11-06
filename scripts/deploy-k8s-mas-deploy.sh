#!/bin/bash

# deploy to k8s environment (dev or prod)

set -e

# Check if environment parameter is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <environment> [api_timestamp] [matrix_timestamp]"
    echo "  environment: dev or prod"
    echo "  api_timestamp: optional API backup timestamp"
    echo "  matrix_timestamp: optional Matrix/MAS backup timestamp"
    echo "  Dev defaults: API=2025-09-18_10-33-02, Matrix=2025-09-18_10-33-59"
    echo "  Prod defaults: current timestamp (no restore)"
    exit 1
fi

ENVIRONMENT="$1"
# For dev environment, default to latest backup; for prod, use current timestamp
if [[ "$ENVIRONMENT" == "dev" ]]; then
    API_TIMESTAMP="${2:-2025-09-18_10-33-02}"
    MATRIX_TIMESTAMP="${3:-2025-09-18_10-33-59}"
else
    API_TIMESTAMP="${2:-$(date +%Y-%m-%d_%H-%M-%S)}"
    MATRIX_TIMESTAMP="${3:-$(date +%Y-%m-%d_%H-%M-%S)}"
fi

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "❌ Error: Environment must be 'dev' or 'prod'"
    exit 1
fi

# Link appropriate environment file
ln -sf ".env-${ENVIRONMENT}" .env

# Source the environment file to get database configuration
source .env

echo "=== OpenMeet K8s Complete Deployment Workflow (ArgoCD) ==="
echo "Environment: $ENVIRONMENT"
echo "Namespace: $ENVIRONMENT"
echo "API Timestamp: $API_TIMESTAMP"
echo "Matrix Timestamp: $MATRIX_TIMESTAMP"
echo "Target: ${DB_HOST:-$DATABASE_HOST}:${DB_PORT:-$DATABASE_PORT}"
echo "Main DB: ${MAIN_DB:-$DATABASE_NAME} (restore)"
echo "Matrix DBs: ${SYNAPSE_DB:-$SYNAPSE_DATABASE_NAME}, ${MAS_DB:-$MAS_DATABASE_NAME} (restore)"
echo
echo "Note: Using ArgoCD for deployment (updates kustomization.yaml and pushes to Git)"
echo

read -p "Continue with full K8s deployment to $ENVIRONMENT? (yes): " -r
[[ ! $REPLY =~ ^yes$ ]] && exit 0

# Get current git commit hash for image tag
CURRENT_COMMIT=$(git rev-parse HEAD)
echo
echo "Current API commit: $CURRENT_COMMIT"

echo
echo "1. Updating image tags in kustomization.yaml and pushing to Git..."
cd ../openmeet-infrastructure
KUSTOMIZATION_FILE="k8s/environments/$ENVIRONMENT/kustomization.yaml"

# Update API image tag
sed -i "s|openmeet-api:[a-f0-9]\{40\}|openmeet-api:${CURRENT_COMMIT}|g" "$KUSTOMIZATION_FILE"
echo "  ✅ Updated API image to: ${CURRENT_COMMIT}"

# Check if there are changes to commit
if git diff --quiet "$KUSTOMIZATION_FILE"; then
    echo "  ℹ️  No image tag changes (already at ${CURRENT_COMMIT})"
else
    echo "  📝 Committing and pushing image tag update..."
    git add "$KUSTOMIZATION_FILE"
    git commit -m "chore(k8s): update API image tag to ${CURRENT_COMMIT} for ${ENVIRONMENT}

Automated deployment via deploy-k8s-mas-deploy.sh
ArgoCD will automatically sync this change."

    git push origin main
    echo "  ✅ Pushed to origin/main - ArgoCD will sync automatically"

    echo "  ⏳ Waiting 30 seconds for ArgoCD to detect changes..."
    sleep 30
fi

cd ../openmeet-api

echo
echo "2. Scaling down API, Matrix and MAS services in $ENVIRONMENT namespace..."
kubectl scale deployment api --replicas=0 -n "$ENVIRONMENT" || echo "⚠️  API deployment not found or already scaled"
kubectl scale deployment matrix-synapse --replicas=0 -n "$ENVIRONMENT" || echo "⚠️  Matrix deployment not found or already scaled"
kubectl scale deployment mas --replicas=0 -n "$ENVIRONMENT" || echo "⚠️  MAS deployment not found or already scaled"

# Wait for pods to terminate
echo "Waiting for pods to terminate..."
kubectl wait --for=delete pod -l app=api -n "$ENVIRONMENT" --timeout=60s || true
kubectl wait --for=delete pod -l app=matrix-synapse -n "$ENVIRONMENT" --timeout=60s || true
kubectl wait --for=delete pod -l app=mas -n "$ENVIRONMENT" --timeout=60s || true

if [[ "$ENVIRONMENT" == "dev" ]]; then
    echo
    echo "3. Restoring main API database (dev only)..."
    ./scripts/restore-db.sh "$API_TIMESTAMP"
else
    echo
    echo "3. Skipping database restore (prod environment - preserving existing data)..."
fi

echo
echo "4. Restoring Matrix/MAS databases..."
./scripts/restore-matrix-mas-dbs.sh "$MATRIX_TIMESTAMP"

echo
echo "5. Running tenant migrations..."
npm run migration:run:tenants

echo
echo "6. Scaling up API, Matrix and MAS services in $ENVIRONMENT namespace..."
kubectl scale deployment api --replicas=1 -n "$ENVIRONMENT"
kubectl scale deployment matrix-synapse --replicas=1 -n "$ENVIRONMENT"
kubectl scale deployment mas --replicas=1 -n "$ENVIRONMENT"

# Wait for pods to be ready
echo "Waiting for services to be ready..."
kubectl wait --for=condition=available deployment/api -n "$ENVIRONMENT" --timeout=300s
kubectl wait --for=condition=available deployment/matrix-synapse -n "$ENVIRONMENT" --timeout=300s
kubectl wait --for=condition=available deployment/mas -n "$ENVIRONMENT" --timeout=300s

ln -sf .env-local .env

echo
echo "✅ Complete K8s deployment finished!"
echo "  • Environment: $ENVIRONMENT"
echo "  • Namespace: $ENVIRONMENT"
echo "  • Image tag: ${CURRENT_COMMIT}"
echo "  • Deployment method: ArgoCD (Git-driven)"
echo "  • API, Matrix and MAS services: Scaled down, databases restored, scaled back up"
if [[ "$ENVIRONMENT" == "dev" ]]; then
    echo "  • Main DB: Restored from backup ($API_TIMESTAMP)"
else
    echo "  • Main DB: Preserved existing data (prod environment)"
fi
echo "  • Matrix/MAS DBs: Restored from backup ($MATRIX_TIMESTAMP)"
echo "  • Tenant migrations: Applied to restored data"