#!/bin/bash

# Script to generate Bluesky OAuth keys compatible with Node.js 22 and modern OpenSSL
# This script generates EC P-256 keys in a format that works with the latest Node.js versions

# Create output file
OUTPUT_FILE="bluesky_keys.txt"
echo "# Bluesky OAuth Keys for Node.js 22" > "$OUTPUT_FILE"
echo "# Generated on $(date)" >> "$OUTPUT_FILE"
echo "# Compatible with Node.js 22.x and modern OpenSSL" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Function to check OpenSSL version and adapt parameters if needed
check_openssl_version() {
    OPENSSL_VERSION=$(openssl version | cut -d' ' -f2)
    echo "Using OpenSSL version: $OPENSSL_VERSION"
    
    # Add OpenSSL version to output file for reference
    echo "# Generated with OpenSSL $OPENSSL_VERSION" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
}

# Check OpenSSL version
check_openssl_version

# Set up parameters
CURVE="P-256"
echo "Generating keys using curve: $CURVE"

# Generate keys in a loop
for i in 1 2 3; do
    echo "Generating key pair #$i..."
    
    # Create temporary directory for this key pair
    TEMP_DIR=$(mktemp -d)
    
    # Step 1: Generate EC parameters
    PARAM_FILE="$TEMP_DIR/ec_params.pem"
    openssl ecparam -name $CURVE -out "$PARAM_FILE"
    
    # Step 2: Generate private key using the parameters
    # Modern OpenSSL prefers this two-step approach for better compatibility
    PRIVATE_KEY_FILE="bluesky_private_key_${i}.pem"
    openssl ecparam -in "$PARAM_FILE" -genkey -noout -out "$TEMP_DIR/ec_key.pem"
    
    # Step 3: Convert to PKCS#8 format for better compatibility
    openssl pkcs8 -topk8 -in "$TEMP_DIR/ec_key.pem" -out "$PRIVATE_KEY_FILE" -nocrypt
    
    # Step 4: Generate public key
    PUBLIC_KEY_FILE="bluesky_public_key_${i}.pem"
    openssl ec -in "$TEMP_DIR/ec_key.pem" -pubout -out "$PUBLIC_KEY_FILE"
    
    # Step 5: Validate the key format
    echo "Validating key format..."
    if openssl pkey -in "$PRIVATE_KEY_FILE" -text -noout > /dev/null 2>&1; then
        echo "✓ Key #$i validated successfully"
    else
        echo "⚠️ Warning: Key #$i validation failed, may not be compatible"
    fi
    
    # Step 6: Base64 encode for environment variable
    # Using proper wrapping for consistent format
    PRIVATE_KEY_CONTENT=$(cat "$PRIVATE_KEY_FILE" | base64 -w 0)
    echo "BLUESKY_KEY_${i}=$PRIVATE_KEY_CONTENT" >> "$OUTPUT_FILE"
    
    # Clean up temporary files
    rm -rf "$TEMP_DIR"
done

echo "" >> "$OUTPUT_FILE"
echo "# Add these values to your Kubernetes secrets or .env file" >> "$OUTPUT_FILE"
echo "# Public keys are stored as bluesky_public_key_*.pem files" >> "$OUTPUT_FILE"
echo "# For Kubernetes, remember to update the secrets in:" >> "$OUTPUT_FILE"
echo "# openmeet-infrastructure/k8s/environments/prod/kustomization.yaml" >> "$OUTPUT_FILE"

echo ""
echo "==================================================================="
echo "✅ Keys have been successfully generated!"
echo "📄 Private keys saved as: bluesky_private_key_[1-3].pem"
echo "🔑 Public keys saved as: bluesky_public_key_[1-3].pem"
echo "📝 Environment variables saved to: $OUTPUT_FILE"
echo ""
echo "🔴 IMPORTANT: After updating keys in production, verify the Bluesky"
echo "   authentication flow by testing the login process."
echo "==================================================================="