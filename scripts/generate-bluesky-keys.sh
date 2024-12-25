#!/bin/bash

# Create output file
OUTPUT_FILE="bluesky_keys.txt"
echo "# Bluesky OAuth Keys" > "$OUTPUT_FILE"
echo "# Generated on $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Generate keys in a loop
for i in 1 2 3; do
    # Generate private key in PKCS#8 format using P-256 curve
    PRIVATE_KEY_FILE="bluesky_private_key_${i}.pem"
    openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$PRIVATE_KEY_FILE"
    
    # Generate public key
    PUBLIC_KEY_FILE="bluesky_public_key_${i}.pem"
    openssl pkey -in "$PRIVATE_KEY_FILE" -pubout -out "$PUBLIC_KEY_FILE"
    
    # Base64 encode the private key for environment variable
    PRIVATE_KEY_CONTENT=$(cat "$PRIVATE_KEY_FILE" | base64 -w 0)
    echo "BLUESKY_KEY_${i}=$PRIVATE_KEY_CONTENT" >> "$OUTPUT_FILE"
done

echo "" >> "$OUTPUT_FILE"
echo "# Add these values to your .env file" >> "$OUTPUT_FILE"
echo "# Public keys are stored as bluesky_public_key_*.pem files" >> "$OUTPUT_FILE"

echo "Keys have been saved to $OUTPUT_FILE"
echo "Public keys are stored as bluesky_public_key_1.pem, bluesky_public_key_2.pem, bluesky_public_key_3.pem in the current directory." 