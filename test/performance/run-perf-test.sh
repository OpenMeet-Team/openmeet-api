#!/bin/bash
# Performance test runner for OpenMeet API

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"

# Default values
BASE_URL="${BASE_URL:-http://localhost:3001/api/v1}"
TENANT_ID="${TENANT_ID:-openmeet-local}"
TEST_FILE="${1:-events-list.k6.js}"

# Create results directory if it doesn't exist
mkdir -p "${RESULTS_DIR}"

# Generate timestamp for results
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="${RESULTS_DIR}/${TEST_FILE%.k6.js}_${TIMESTAMP}.json"

echo "========================================"
echo "OpenMeet API Performance Test"
echo "========================================"
echo "Base URL: ${BASE_URL}"
echo "Tenant ID: ${TENANT_ID}"
echo "Test file: ${TEST_FILE}"
echo "Results: ${RESULT_FILE}"
echo "========================================"

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "Error: k6 is not installed."
    echo "Install it with: sudo apt install k6"
    echo "Or: brew install k6"
    exit 1
fi

# Check if API is reachable
echo "Checking API health..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL/api\/v1/health}" -H "x-tenant-id: ${TENANT_ID}" 2>/dev/null || echo "000")

if [ "$HEALTH_STATUS" != "200" ]; then
    echo "Warning: API health check returned status ${HEALTH_STATUS}"
    echo "Make sure the API is running at ${BASE_URL}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run k6 test
echo "Running performance test..."
k6 run \
    --env BASE_URL="${BASE_URL}" \
    --env TENANT_ID="${TENANT_ID}" \
    --out json="${RESULT_FILE}" \
    "${SCRIPT_DIR}/${TEST_FILE}"

echo ""
echo "Results saved to: ${RESULT_FILE}"
echo "Summary saved to: ${RESULTS_DIR}/events-list-summary.json"
