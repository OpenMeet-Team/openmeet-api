# Matrix Credential Management

This document outlines the comprehensive credential management approach for Matrix integration, including issue resolution, implementation strategies, and reset procedures.

## Current Issues

We've encountered 401 `M_UNKNOWN_TOKEN` errors when using stored Matrix credentials. This happens when:

1. The Matrix server is reset or redeployed (tokens on server no longer valid)
2. Matrix users exist but with different credentials than stored in OpenMeet
3. User tokens expire or are invalidated

Common error messages:
- `M_UNKNOWN_TOKEN`
- `Invalid access token passed`

## Credential Management Strategy

### Core Principles

1. **Maintain Existing Matrix User IDs**
   - When possible, preserve the user's Matrix user ID
   - Avoid creating duplicate users in Matrix
   - Ensure consistent user identities across resets

2. **Handle Authentication Errors Gracefully**
   - Detect token errors and attempt recovery
   - Implement multi-stage fallback mechanism
   - Provide clear error messages for unrecoverable issues

3. **Avoid Frequent Validation**
   - Don't validate credentials on every interaction
   - Only check when an actual Matrix API call fails with an auth error
   - Cache validation results to avoid repeated checks

4. **Secure Storage**
   - Store Matrix tokens securely in the database
   - Never expose tokens to the frontend
   - All Matrix operations should happen server-side

### Implementation Approach

```typescript
// This would be implemented in the Matrix chat service adapter
async handleMatrixOperation(userId: string, operation: () => Promise<any>) {
  try {
    // Attempt the operation with current credentials
    return await operation();
  } catch (error) {
    // Check if this is a token error
    if (error.errcode === 'M_UNKNOWN_TOKEN') {
      this.logger.warn(`Matrix token invalid for user ${userId}, attempting re-auth...`);
      
      try {
        // Get user details with current Matrix credentials
        const user = await this.userService.findById(userId);
        
        if (!user.matrixUserId) {
          // If user has no Matrix ID, provision a new one
          return await this.provisionNewMatrixUser(userId);
        }
        
        // Try to reset token by logging in with existing Matrix ID
        const newCredentials = await this.matrixUserService.resetUserToken(user.matrixUserId);
        
        // Update database with new token
        await this.userService.update(userId, {
          matrixAccessToken: newCredentials.accessToken,
          matrixDeviceId: newCredentials.deviceId,
          // Keep the same Matrix user ID
        });
        
        // Retry the original operation
        return await operation();
      } catch (resetError) {
        this.logger.error(
          `Failed to reset Matrix token for user ${userId}, falling back to reprovisioning`,
          resetError
        );
        
        // If re-auth fails, fall back to full reprovisioning
        return await this.reprovisionMatrixUser(userId);
      }
    }
    
    // For other errors, just rethrow
    throw error;
  }
}

async reprovisionMatrixUser(userId: string) {
  const user = await this.userService.findById(userId);
  
  try {
    // Try to keep the same Matrix ID if possible
    const existingMatrixId = user.matrixUserId;
    
    if (existingMatrixId) {
      // Check if the user still exists on the Matrix server
      const userExists = await this.matrixUserService.checkUserExists(existingMatrixId);
      
      if (userExists) {
        // If user exists, just reset the token
        return await this.handleMatrixOperation(userId, async () => {
          // Reset token and retry original operation
        });
      }
    }
    
    // If user doesn't exist or we can't reuse the ID, create a fresh user
    const newCredentials = await this.matrixUserService.createUser(
      user.email,
      generateSecurePassword(),
      user.name
    );
    
    // Update user with new credentials
    await this.userService.update(userId, {
      matrixUserId: newCredentials.userId,
      matrixAccessToken: newCredentials.accessToken,
      matrixDeviceId: newCredentials.deviceId,
    });
    
    return await this.handleMatrixOperation(userId, async () => {
      // Retry original operation with new credentials
    });
  } catch (error) {
    this.logger.error(`Failed to reprovision Matrix user for ${userId}`, error);
    throw new Error('Failed to provision Matrix access. Please try again later.');
  }
}
```

## Reset Procedures

### Database Reset Options

1. **Full Reset (creates new Matrix users)**
   ```sql
   UPDATE "user" SET matrix_user_id = NULL, matrix_access_token = NULL, matrix_device_id = NULL;
   ```

2. **Preserve Matrix IDs, only reset tokens (preferred)**
   ```sql
   UPDATE "user" SET matrix_access_token = NULL, matrix_device_id = NULL;
   ```

### Domain Mismatch Reset

When running a local Matrix server alongside the OpenMeet API with data imported from another environment (production/staging), you will likely encounter domain mismatch errors. This happens because database records reference Matrix rooms and user IDs from different domains (e.g., `matrix.openmeet.net` vs `matrix-local.openmeet.test`).

Common errors include:
- "Unknown room" when trying to access a room ID from another domain
- "User not in room" when trying to interact with mismatched domains
- "Invalid access token" errors for tokens from another Matrix server

To resolve these issues, execute these SQL commands:

```sql
-- Reset user Matrix credentials
UPDATE users SET "matrixUserId" = NULL, "matrixAccessToken" = NULL, "matrixDeviceId" = NULL;

-- Clear Matrix room IDs from events and groups
UPDATE events SET "matrixRoomId" = NULL;
UPDATE groups SET "matrixRoomId" = NULL;

-- Remove all chat rooms and their user associations
DELETE FROM "chatRooms";
DELETE FROM "userChatRooms";
```

After executing these commands and restarting the API:
1. New Matrix user accounts will be provisioned on the local server as needed
2. New chat rooms will be created with the correct local domain
3. User-room associations will be rebuilt correctly

Note: This approach is for development environments only. For production migrations between Matrix servers, a more careful migration strategy with room/user ID mapping would be needed.

### Local Development Reset

1. **Start with Docker Compose**
   ```
   docker-compose -f docker-compose-dev.yml up -d
   ```

2. **Get Admin Token**
   ```
   docker-compose -f docker-compose-dev.yml logs matrix | grep -A 10 "Success! Matrix server initialized"
   ```

3. **Update `.env` File**
   ```
   MATRIX_ADMIN_ACCESS_TOKEN=your_token_from_logs
   MATRIX_ADMIN_USER=@admin:matrix-local.openmeet.test
   ```

4. **Reset User Tokens**
   ```sql
   UPDATE "user" SET matrix_access_token = NULL, matrix_device_id = NULL;
   ```

### Dev/Production Environment Reset

1. **Backup Configuration**
   - Save current admin token and credentials
   - Document existing settings

2. **Reset Matrix Database**
   ```bash
   # Scale down Matrix deployment
   kubectl scale statefulset matrix --replicas=0 -n openmeet-dev
   
   # Delete the PVC to remove existing data
   kubectl delete pvc data-matrix-0 -n openmeet-dev
   
   # Scale back up to recreate with fresh volume
   kubectl scale statefulset matrix --replicas=1 -n openmeet-dev
   ```

3. **Initialize Matrix Admin**
   ```bash
   # SSH into Matrix pod
   kubectl exec -it matrix-0 -n openmeet-dev -- bash
   
   # Register admin user
   register_new_matrix_user -u admin -p <secure-password> -a -c /data/homeserver.yaml http://localhost:8008
   
   # Get access token
   curl -X POST -d '{"type":"m.login.password", "user":"admin", "password":"<password>"}' http://localhost:8008/_matrix/client/r0/login
   ```

4. **Update Configuration**
   - Update admin token in AWS Parameter Store
   - Update Kubernetes secret or ConfigMap
   - Restart API pods to pick up new configuration

5. **Clear User Credentials**
   ```sql
   UPDATE "user" SET matrix_access_token = NULL, matrix_device_id = NULL;
   ```

## Automatic Recovery

The credential management system enables automatic recovery:
- Invalid tokens are automatically detected
- Recovery attempts first try to preserve the Matrix user ID
- Users are transparently re-provisioned if needed
- All existing room memberships are restored

## Expected User Experience

From a user perspective, the process will be seamless:
- Users may experience a brief delay on first chat access after a reset
- Subsequent operations will work normally
- Users retain their chat history and room memberships
- No manual user intervention required

## Future Enhancements

1. **Refresh Tokens**
   - Implement Matrix refresh tokens when supported
   - Handle token expiration elegantly

2. **Credential Caching**
   - Add in-memory cache of valid credentials
   - Reduce database load for frequent chat users

3. **Background Validation**
   - Periodically validate sample tokens
   - Detect system-wide issues before users encounter them

4. **Admin Dashboard**
   - Provide tools for admins to reset specific users' credentials
   - Add visibility into Matrix token status

5. **Monitoring**
   - Add monitoring for authentication failures
   - Create alerts for unusual error patterns

6. **Token Rotation**
   - Implement automatic token rotation for long-lived sessions
   - Enhance security by limiting token lifetime