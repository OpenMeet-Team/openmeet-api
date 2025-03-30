#!/bin/bash

# Default values
NAMESPACE="openmeet-api-prod"
MINUTES=1
LOG_GROUP="/aws/containerinsights/openmeet-dev/application"

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo "Check CloudWatch logs for OpenMeet API"
    echo ""
    echo "Options:"
    echo "  -n, --namespace   Kubernetes namespace (default: openmeet-api-prod)"
    echo "  -m, --minutes     Number of minutes to look back (default: 1)"
    echo "  -h, --help        Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 -n openmeet-api-prod -m 5"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -m|--minutes)
            MINUTES="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Function to check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo "Error: AWS CLI is not installed"
        exit 1
    fi
}

# Function to check if AWS credentials are configured
check_aws_credentials() {
    if ! aws sts get-caller-identity &> /dev/null; then
        echo "Error: AWS credentials are not configured"
        exit 1
    fi
}

# Main function to get and process logs
get_logs() {
    echo "Fetching logs from the last $MINUTES minutes for namespace: $NAMESPACE"
    
    # Start the query
    QUERY_ID=$(aws logs start-query \
        --log-group-name "$LOG_GROUP" \
        --start-time $(date -d "$MINUTES minutes ago" +%s) \
        --end-time $(date +%s) \
        --query-string "fields @timestamp, log, kubernetes.pod_name | filter kubernetes.namespace_name = \"$NAMESPACE\" | sort kubernetes.pod_name asc, @timestamp asc" \
        --output text)
    
    if [ -z "$QUERY_ID" ]; then
        echo "Error: Failed to start query"
        exit 1
    fi
    
    echo "Query started with ID: $QUERY_ID"
    echo "Waiting for results..."
    
    # Wait for query to complete
    sleep 2
    
    # Get and process results
    RESULTS=$(aws logs get-query-results --query-id "$QUERY_ID")
    
    # Check if we got any results
    if [ "$(echo "$RESULTS" | jq -r '.results | length')" -eq 0 ]; then
        echo "No logs found in the specified time range."
        return
    fi
    
    # Process and display results
    echo "$RESULTS" | \
    jq -r '.results[] | select(.[0].field == "@timestamp") | 
    {
        timestamp: .[0].value,
        log: .[1].value,
        pod: .[2].value
    }' | \
    jq -s 'group_by(.pod) | .[] | 
    "\n=== Pod: \(.[0].pod) ===\n" + 
    (map(.log) | join("\n"))' | \
    sed 's/\\"/"/g' | # Remove escaped quotes
    while IFS= read -r line; do
        echo -e "$line"
    done
}

# Main execution
check_aws_cli
check_aws_credentials
get_logs 