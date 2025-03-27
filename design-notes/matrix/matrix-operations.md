# Matrix Operations Guide

This document provides practical guidance for developers working with the Matrix integration in OpenMeet, including setup, testing, monitoring, and troubleshooting.

## Local Development Setup

1. **Start Matrix Server**
   ```bash
   docker-compose -f docker-compose-dev.yml up -d
   ```

2. **Get Admin Token**
   ```bash
   docker-compose -f docker-compose-dev.yml logs matrix | grep -A 10 "Success! Matrix server initialized"
   ```

3. **Update Environment Variables**
   ```
   MATRIX_ADMIN_ACCESS_TOKEN=your_token_from_logs
   MATRIX_ADMIN_USER=@admin:matrix-local.openmeet.test
   MATRIX_SERVER_NAME=matrix-local.openmeet.test
   MATRIX_HOME_SERVER=http://matrix:8008
   MATRIX_ADMIN_PASSWORD=your_admin_password  # Required for token regeneration
   ```

4. **Reset Credentials (if needed)**
   ```sql
   UPDATE "user" SET matrix_access_token = NULL, matrix_device_id = NULL;
   ```

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
   - Track Matrix authentication failures
   - Monitor token refresh attempts
   - Alert on unusual error patterns

2. **Performance Metrics**
   - Response times for chat operations
   - WebSocket connection lifecycle events
   - Message delivery latency

3. **Resource Usage**
   - Matrix client instance count
   - Database connection pool usage
   - Memory consumption

## Troubleshooting

### Common Issues

1. **M_UNKNOWN_TOKEN Errors**
   - **Symptom**: Chat operations fail with 401 errors
   - **Cause**: Invalid or expired Matrix tokens
   - **Solution**: 
     - System will automatically regenerate admin tokens if MATRIX_ADMIN_PASSWORD is configured
     - For user tokens, reset in database; system will automatically reprovision

2. **User Not In Room Errors**
   - **Symptom**: "User not in room" errors when performing admin operations
   - **Cause**: Admin user not joined to room before performing operations
   - **Solution**: 
     - Automatic with latest updates - admin will be joined to rooms before operations
     - If issues persist, check Matrix server logs for rate limiting or permission errors

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