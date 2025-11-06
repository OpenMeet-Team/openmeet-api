#!/bin/bash

# deploy to k8s environment (dev or prod)

set -e

# Check if environment parameter is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <environment> [api_timestamp] [matrix_timestamp] [commit_hash]"
    echo "  environment: dev or prod"
    echo "  api_timestamp: optional API backup timestamp"
    echo "  matrix_timestamp: optional Matrix/MAS backup timestamp"
    echo "  commit_hash: optional commit hash to deploy (defaults to current HEAD)"
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

# Optional commit hash parameter (defaults to current HEAD)
DEPLOY_COMMIT="${4:-$(git rev-parse HEAD)}"

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

echo
echo "Deploy commit: $DEPLOY_COMMIT"

echo
echo "1. Validating and updating infrastructure repository..."

# Check if infrastructure repo exists
if [[ ! -d "../openmeet-infrastructure" ]]; then
    echo "❌ Error: ../openmeet-infrastructure directory not found"
    exit 1
fi

cd ../openmeet-infrastructure

# Check if it's a git repo
if [[ ! -d ".git" ]]; then
    echo "❌ Error: ../openmeet-infrastructure is not a git repository"
    exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "⚠️  Warning: Infrastructure repo is on branch '$CURRENT_BRANCH', not 'main'"
    read -p "Continue anyway? (yes): " -r
    [[ ! $REPLY =~ ^yes$ ]] && exit 0
fi

# Pull latest changes
echo "  📥 Pulling latest changes from origin..."
git pull origin main || {
    echo "❌ Error: Failed to pull from origin/main"
    exit 1
}

KUSTOMIZATION_FILE="k8s/environments/$ENVIRONMENT/kustomization.yaml"

# Check if kustomization file exists
if [[ ! -f "$KUSTOMIZATION_FILE" ]]; then
    echo "❌ Error: $KUSTOMIZATION_FILE not found"
    exit 1
fi

# Update API image tag
sed -i "s|openmeet-api:[a-f0-9]\{40\}|openmeet-api:${DEPLOY_COMMIT}|g" "$KUSTOMIZATION_FILE"
echo "  ✅ Updated API image to: ${DEPLOY_COMMIT}"

# Check if there are changes to commit
if git diff --quiet "$KUSTOMIZATION_FILE"; then
    echo "  ℹ️  No image tag changes (already at ${DEPLOY_COMMIT})"
else
    echo
    echo "Changes to be committed:"
    git diff "$KUSTOMIZATION_FILE" | grep "^[-+].*openmeet-api:" || true
    echo
    read -p "Push these changes to origin/main? (yes): " -r
    if [[ $REPLY =~ ^yes$ ]]; then
        git add "$KUSTOMIZATION_FILE"
        git commit -m "chore(k8s): update API image tag to ${DEPLOY_COMMIT} for ${ENVIRONMENT}

Automated deployment via deploy-k8s-mas-deploy.sh
ArgoCD will automatically sync this change."

        git push origin main || {
            echo "❌ Error: Failed to push to origin/main"
            exit 1
        }
        echo "  ✅ Pushed to origin/main - ArgoCD will sync automatically"

        echo "  ⏳ Waiting 45 seconds for ArgoCD to detect and sync changes..."
        sleep 45
    else
        echo "❌ Deployment cancelled - changes not pushed"
        git restore "$KUSTOMIZATION_FILE"
        cd ../openmeet-api
        exit 0
    fi
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
echo "  • Image tag: ${DEPLOY_COMMIT}"
echo "  • Deployment method: ArgoCD (Git-driven)"
echo "  • API, Matrix and MAS services: Scaled down, databases restored, scaled back up"
if [[ "$ENVIRONMENT" == "dev" ]]; then
    echo "  • Main DB: Restored from backup ($API_TIMESTAMP)"
else
    echo "  • Main DB: Preserved existing data (prod environment)"
fi
echo "  • Matrix/MAS DBs: Restored from backup ($MATRIX_TIMESTAMP)"
echo "  • Tenant migrations: Applied to restored data"