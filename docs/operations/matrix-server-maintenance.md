# Matrix Server Maintenance

This document provides operations procedures for maintaining the Matrix chat server used by OpenMeet.

## Resetting the Matrix Database

When the Matrix server accumulates too many rooms and becomes sluggish, a full database reset may be necessary for development environments.

### Pre-Reset Checklist

1. Ensure you have admin access to the Matrix server
2. Verify this is not a production environment
3. Alert all team members that Matrix chat will be unavailable during reset
4. Backup the current database if any data needs to be preserved

### Reset Procedure for Docker-based Matrix Synapse

If you're using the Docker Compose setup for Matrix Synapse:

```bash
# Stop the Matrix services
docker-compose stop synapse postgres

# Remove the containers (optional)
docker-compose rm -f synapse postgres

# Remove the volume containing the database
docker volume rm matrix_synapse_data matrix_postgres_data

# Recreate and start the services
docker-compose up -d synapse postgres
```

### Reset Procedure for Standalone Matrix Synapse

For a standalone Matrix Synapse server:

1. Stop the Matrix Synapse service:
   ```bash
   sudo systemctl stop matrix-synapse
   ```

2. Drop and recreate the database:
   ```bash
   sudo -u postgres psql -c "DROP DATABASE synapse;"
   sudo -u postgres psql -c "CREATE DATABASE synapse OWNER synapse ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' template=template0;"
   ```

3. Remove any existing media and storage:
   ```bash
   sudo rm -rf /var/lib/matrix-synapse/media
   sudo mkdir -p /var/lib/matrix-synapse/media
   sudo chown matrix-synapse:matrix-synapse /var/lib/matrix-synapse/media
   ```

4. Start Matrix Synapse service:
   ```bash
   sudo systemctl start matrix-synapse
   ```

### Post-Reset Steps

1. Create the initial admin account if needed:
   ```bash
   # For Docker setup
   docker-compose exec synapse register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008 -a

   # For standalone setup
   register_new_matrix_user -c /etc/matrix-synapse/homeserver.yaml http://localhost:8008 -a
   ```

2. Update the OpenMeet application's Matrix admin credentials if they changed

3. Clear any Matrix room references in the OpenMeet database:
   ```sql
   -- Optional: Clear Matrix room IDs from all events
   UPDATE "events" SET "matrixRoomId" = NULL;
   
   -- Optional: Clear chat room tables if they reference Matrix rooms
   TRUNCATE "chatRooms" CASCADE;
   ```

4. Restart the OpenMeet API service to establish new connections to Matrix

## Implementing Room Retention

Until a proper retention policy is implemented in code, here's a temporary solution:

### Create a Purge Script

Create a script named `purge_old_matrix_rooms.sh`:

```bash
#!/bin/bash
# Script to purge old Matrix rooms for events that have ended

# Get all rooms on the server
rooms=$(curl -s -H "Authorization: Bearer YOUR_ADMIN_TOKEN" "http://localhost:8008/_synapse/admin/v1/rooms" | jq -r '.rooms[].room_id')

# For each room, check creation date and delete if older than 1 month
for room_id in $rooms; do
  # Get room details
  creation_ts=$(curl -s -H "Authorization: Bearer YOUR_ADMIN_TOKEN" "http://localhost:8008/_synapse/admin/v1/rooms/$room_id" | jq '.created_ts')
  
  # Calculate age in days
  age_days=$(( ( $(date +%s) - creation_ts/1000 ) / 86400 ))
  
  # If older than 30 days, delete the room
  if [ $age_days -gt 30 ]; then
    echo "Deleting room $room_id (age: $age_days days)"
    curl -X DELETE -H "Authorization: Bearer YOUR_ADMIN_TOKEN" "http://localhost:8008/_synapse/admin/v1/rooms/$room_id"
  fi
done
```

Run this script manually or set it up as a cron job until a proper solution is implemented.

## Troubleshooting

### Common Issues

1. **Server remains slow after reset**: Check if the server has enough resources allocated (memory, CPU).

2. **Connection errors after reset**: Verify that the application's Matrix credentials are correctly configured.

3. **Users can't join rooms**: Ensure that user registration is enabled in the Matrix configuration.

### Logs

Check the following logs for issues:

```bash
# Docker setup
docker-compose logs synapse

# Standalone setup
sudo journalctl -u matrix-synapse
# or
sudo tail -f /var/log/matrix-synapse/homeserver.log
``` 