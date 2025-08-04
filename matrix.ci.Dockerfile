FROM matrixdotorg/synapse:v1.132.0

# Install required packages
RUN apt-get update && \
    apt-get install -y gettext-base jq curl python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy configuration files
# COPY matrix-config/homeserver.yaml /data/homeserver.yaml
COPY matrix-config/log.config /data/log.config
COPY matrix-config/start-matrix.sh /data/start-matrix.sh
COPY matrix-config/init.sh /data/init.sh

# Make scripts executable
RUN chmod +x /data/start-matrix.sh && \
    chmod +x /data/init.sh

# Create directory for processed config
RUN mkdir -p /processed-config

# Set the entrypoint to our startup script
ENTRYPOINT ["/bin/bash", "/data/start-matrix.sh"] 