#!/bin/sh
set -e

echo 'Installing gomplate and openssl for local development...'
apk add --no-cache openssl curl

curl -o /usr/local/bin/gomplate -sSL https://github.com/hairyhenderson/gomplate/releases/latest/download/gomplate_linux-amd64
chmod +x /usr/local/bin/gomplate

echo 'Generating signing keys for local development...'
mkdir -p /tmp/keys
openssl genrsa -out /tmp/keys/rsa-key.pem 2048
openssl ecparam -genkey -name prime256v1 -noout -out /tmp/keys/ec-key.pem

export MAS_RSA_PRIVATE_KEY="$(cat /tmp/keys/rsa-key.pem)"
export MAS_EC_PRIVATE_KEY="$(cat /tmp/keys/ec-key.pem)"

echo 'Rendering Matrix configurations for local development...'
gomplate -f /templates/mas-config.gomplate.yaml -o /rendered-config/mas-config.yaml
gomplate -f /templates/homeserver-mas.gomplate.yaml -o /rendered-config/homeserver.yaml

mkdir -p /rendered-config/appservices
gomplate -f /templates/openmeet-appservice.gomplate.yaml -o /rendered-config/appservices/openmeet-appservice.yaml

echo 'Configuration rendering completed successfully for local development'
ls -la /rendered-config/

echo 'Config renderer staying alive for local development...'
sleep infinity