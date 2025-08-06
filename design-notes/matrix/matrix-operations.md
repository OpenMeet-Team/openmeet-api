# Matrix Operations Guide

This document provides practical guidance for developers working with the Matrix integration in OpenMeet, including setup, testing, monitoring, and troubleshooting.

## Local Development Setup

### Matrix Bot Authentication (Current Implementation - July 2025)

**Uses Dedicated Bot Users**: Each tenant has a dedicated bot user that authenticates via MAS → OpenMeet OIDC flow.

1. **Start Matrix Server**
   ```bash
   docker-compose -f docker-compose-dev.yml up -d
   ```

2. **Bot User Configuration (Per Tenant)**
   ```bash
   # Bot users are defined in TENANTS_B64 configuration
   # Example for tenant lsdfaopkljdfs:
   "botUser": {
     "email": "bot-lsdfaopkljdfs@openmeet.net",
     "slug": "openmeet-bot-lsdfaopkljdfs", 
     "password": "bot-secure-password-lsdfaopkljdfs-2025"
   }
   ```

3. **Environment Variables (MAS OIDC Configuration)**
   ```bash
   # MAS Authentication Service Configuration  
   MAS_PUBLIC_URL=http://localhost:8081
   # Note: No MAS_CLIENT_ID needed - uses dynamic client registration
   MAS_REDIRECT_URI=http://localhost:9005/auth/matrix/callback
   MAS_SCOPES=openid email
   
   # Matrix server configuration
   MATRIX_SERVER_NAME=matrix.openmeet.net
   MATRIX_HOMESERVER_URL=http://localhost:8448
   
   # Bot email domain
   BOT_EMAIL_DOMAIN=openmeet.net
   ```

4. **Bot Authentication Flow (Updated July 3, 2025)**
   ```
   1. MatrixBotUserService retrieves bot user for specific tenant
   2. MatrixRoomService.createBotClient() initiates OIDC flow with MAS
   3. Bot authenticates using MAS /authorize endpoint (not /upstream/authorize/openmeet)
   4. MAS redirects to OpenMeet OIDC using configured client ID and redirect URI
   5. OpenMeet authenticates bot user and returns authorization code
   6. MAS exchanges code for Matrix access token via /oauth2/token
   7. Bot receives Matrix client with proper authentication
   8. Bot performs room management operations for that tenant
   ```

5. **Reset User Credentials (if needed)**
   ```sql
   UPDATE "user" SET matrix_access_token = NULL, matrix_device_id = NULL;
   ```

### Legacy Admin Token Setup (Deprecated)

> **⚠️ DEPRECATED**: Admin token authentication has been replaced with Matrix bot authentication due to MacaroonDeserializationException and token instability issues.

<details>
<summary>Legacy Admin Token Instructions (For Reference Only)</summary>

```bash
# Get admin token (no longer used)
docker-compose -f docker-compose-dev.yml logs matrix | grep -A 10 "Success! Matrix server initialized"

# Old environment variables (removed)
MATRIX_ADMIN_ACCESS_TOKEN=your_token_from_logs
MATRIX_ADMIN_USER=@admin:matrix-local.openmeet.test
MATRIX_ADMIN_PASSWORD=your_admin_password
```

</details>

## Testing Strategy

### Automated Testing

#### Unit Tests

- **Matrix Service Tests**
  - Tests for specialized services (Core, User, Room, Message)
  - Mock strategy for Matrix SDK
  - Focus on error handling and recovery

Example test for credential management:
```typescript
describe('MatrixUserService', () => {
  it('should handle token refresh when encountering M_UNKNOWN_TOKEN error', async () => {
    // Setup mock to throw token error on first call
    matrixClientMock.sendMessage.mockRejectedValueOnce({
      errcode: 'M_UNKNOWN_TOKEN'
    }).mockResolvedValueOnce({ event_id: 'new_event_id' });
    
    // Test that operation succeeds after token refresh
    const result = await service.sendMessageWithErrorHandling(userId, roomId, 'test');
    
    // Verify token was refreshed and operation retried
    expect(result.event_id).toBe('new_event_id');
    expect(userServiceMock.update).toHaveBeenCalled();
  });
});
```

#### WebSocket Tests

Current testing status:
- Basic Socket.io endpoint tests passing ✅
- Complex WebSocket tests skipped until implementation complete ⏸️

Required implementations for complete testing:
```
POST /api/chat/event/${eventSlug}/join
POST /api/chat/event/${eventSlug}/typing
POST /api/chat/event/${eventSlug}/message
```

### Manual Testing Checklist

1. **User Provisioning**
   - [ ] New users get Matrix credentials on first chat access
   - [ ] Existing users without credentials get provisioned
   - [ ] Display names in Matrix match OpenMeet names

2. **Group Chats**
   - [ ] New group creates Matrix room
   - [ ] Members can access group chat
   - [ ] Real-time messages between users
   - [ ] Correct permissions for admins/moderators

3. **Event Discussions**
   - [ ] New event creates Matrix room
   - [ ] Attendees can access event chat
   - [ ] Hosts have moderator privileges
   - [ ] Test with multiple concurrent users

4. **WebSocket Functionality**
   - [ ] Connection established on chat page load
   - [ ] Reconnection works after network disruption
   - [ ] Connection status properly indicated
   - [ ] Updates across multiple tabs

5. **Credential Management**
   - [ ] Token error recovery works
   - [ ] Matrix user IDs preserved during resets
   - [ ] Automatic reprovisioning functions correctly

## Monitoring

### Matrix Server Metrics

Matrix Synapse exposes Prometheus metrics at:
- `/_synapse/metrics` on the main HTTP listener (port 8448)
- Dedicated metrics endpoint on port 9090

Key metrics to monitor:
- `synapse_http_server_request_count`: Request volume by endpoint
- `synapse_http_server_response_time_seconds`: Request latency
- `synapse_storage_*`: Database performance metrics
- `synapse_handler_presence_*`: Presence tracking metrics

### Application Monitoring

1. **Error Tracking**
   - Track Matrix bot authentication failures
   - Monitor bot operation failures and retries
   - Alert on unusual error patterns

2. **Performance Metrics**
   - Response times for chat operations
   - Bot operation success rates
   - Message delivery latency

3. **Resource Usage**
   - Matrix bot client connections
   - Database connection pool usage
   - Memory consumption

4. **Bot Monitoring**
   - Bot login success/failure rates
   - Room operation completion times
   - User invitation success rates

## Troubleshooting

### Common Issues with Matrix Bot Authentication

1. **Bot Authentication Failures**
   - **Symptom**: Chat operations fail with authentication errors
   - **Cause**: Invalid bot credentials or Matrix server issues
   - **Solution**: 
     - Verify MATRIX_BOT_USERNAME and MATRIX_BOT_PASSWORD are correct
     - Check Matrix server logs for authentication errors
     - Ensure bot user exists on Matrix server

2. **Bot Not In Room Errors**
   - **Symptom**: "User not in room" errors when bot performs operations
   - **Cause**: Bot user not joined to room before performing operations
   - **Solution**: 
     - Bot automatically joins rooms before operations
     - If issues persist, check Matrix server logs for permission errors
     - Verify bot has appropriate power levels

3. **Bot Registration Issues**
   - **Symptom**: Bot user creation fails during setup
   - **Cause**: Username conflicts or Matrix server configuration issues
   - **Solution**:
     - Ensure bot username is unique on Matrix server
     - Check Matrix server registration settings
     - Verify Matrix server is accessible and running

### Legacy Issues (Resolved with Bot Authentication)

4. **Legacy Admin Token Issues** ❌ **(Resolved)**
   - **Previous Issue**: MacaroonDeserializationException and token expiration
   - **Resolution**: Replaced with stable bot authentication using username/password
   - **Migration**: Admin token logic removed in favor of bot operations

3. **Domain Mismatch Errors**
   - **Symptom**: "Unknown room" or cross-domain errors
   - **Cause**: Matrix room IDs from different server domains
   - **Solution**: Full reset (see below)

4. **WebSocket Connection Issues**
   - **Symptom**: Real-time updates not working
   - **Cause**: WebSocket connection failed or disconnected
   - **Solution**: Check network, JWT token validity, and server logs

5. **Rate Limiting Errors**
   - **Symptom**: "Too Many Requests" (429) errors in logs
   - **Cause**: Making too many Matrix API calls in a short period
   - **Solution**: 
     - These are now handled gracefully and logged as warnings, not errors
     - If persistent, consider increasing rate limits in Matrix server config

### Matrix Reset Procedures

#### Token-Only Reset (Preserves User IDs)
```sql
UPDATE "user" SET matrix_access_token = NULL, matrix_device_id = NULL;
```

#### Full System Reset
```sql
-- Reset user Matrix credentials
UPDATE "user" SET matrix_user_id = NULL, matrix_access_token = NULL, matrix_device_id = NULL;

-- Clear Matrix room IDs from events and groups
UPDATE events SET "matrixRoomId" = NULL;
UPDATE groups SET "matrixRoomId" = NULL;

-- Remove all chat rooms and their user associations
DELETE FROM "chatRooms";
DELETE FROM "userChatRooms";
```

### Matrix Server Reset (Development)

```bash
# Reset the Matrix Docker container
docker-compose -f docker-compose-dev.yml down
docker volume rm openmeet-api_matrix-data
docker-compose -f docker-compose-dev.yml up -d

# Get new admin token and update environment
docker-compose -f docker-compose-dev.yml logs matrix | grep -A 10 "Success! Matrix server initialized"
```

### Matrix Server Reset (Production/Staging)

```bash
# Scale down Matrix deployment
kubectl scale statefulset matrix --replicas=0 -n openmeet-dev

# Delete the PVC to remove existing data
kubectl delete pvc data-matrix-0 -n openmeet-dev

# Scale back up to recreate with fresh volume
kubectl scale statefulset matrix --replicas=1 -n openmeet-dev

# Get new admin token and update configuration
kubectl exec -it matrix-0 -n openmeet-dev -- register_new_matrix_user -u admin -p <secure-password> -a -c /data/homeserver.yaml http://localhost:8008
```

## Migration Strategy

For production cutover from Zulip to Matrix:

1. **Pre-Cutover Preparation**
   - Complete development and testing
   - Prepare database migration scripts
   - Create admin tools for provisioning

2. **Cutover Process**
   - Schedule maintenance window
   - Disable access during cutover
   - Run database migrations
   - Provision Matrix users and rooms
   - Deploy updated backend and frontend

3. **Post-Cutover Support**
   - Monitor system closely
   - Have support team ready
   - Maintain ability to quickly rollback

4. **Decommissioning**
   - Once stable, decommission Zulip
   - Archive data for compliance
   - Remove Zulip-related code