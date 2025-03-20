# Matrix Reset Plan

## Issue Overview

The Matrix chat integration is experiencing authentication errors:
- `M_UNKNOWN_TOKEN`
- `Invalid access token passed`

This indicates a mismatch between stored user tokens in OpenMeet's database and what Matrix server recognizes as valid. This happens when:
1. A Matrix server is redeployed/reset but user tokens in OpenMeet remain unchanged
2. Users exist in Matrix but with different tokens than OpenMeet has stored

## Resolution Strategy

### Local Development

1. Use Docker Compose with local Matrix server:
   ```
   docker-compose -f docker-compose-dev.yml up -d
   ```

2. Get admin token from logs:
   ```
   docker-compose -f docker-compose-dev.yml logs matrix | grep -A 10 "Success! Matrix server initialized"
   ```

3. Add token to `.env`:
   ```
   MATRIX_ADMIN_ACCESS_TOKEN=your_token_from_logs
   MATRIX_ADMIN_USER=@admin:matrix-local.openmeet.test
   ```

### Dev Environment Reset

1. **Backup Configuration**
   - Save current admin token and credentials from AWS Parameter Store
   - Document existing settings

2. **Reset Matrix Database**
   - Scale down Matrix deployment:
     ```
     kubectl scale statefulset matrix --replicas=0 -n openmeet-dev
     ```
   
   - Delete the PVC to remove existing data:
     ```
     kubectl delete pvc data-matrix-0 -n openmeet-dev
     ```
   
   - Scale back up to recreate with fresh volume:
     ```
     kubectl scale statefulset matrix --replicas=1 -n openmeet-dev
     ```

3. **Initialize Matrix Admin**
   - SSH into Matrix pod:
     ```
     kubectl exec -it matrix-0 -n openmeet-dev -- bash
     ```
   
   - Register admin user:
     ```
     register_new_matrix_user -u admin -p <secure-password> -a -c /data/homeserver.yaml http://localhost:8008
     ```
   
   - Get access token:
     ```
     curl -X POST -d '{"type":"m.login.password", "user":"admin", "password":"<password>"}' http://localhost:8008/_matrix/client/r0/login
     ```

4. **Update OpenMeet Configuration**
   - Update admin token in AWS Parameter Store
   - Update Kubernetes secret or ConfigMap
   - Restart API pods to pick up new configuration

5. **Clear User Credentials**
   - Connect to database and clear existing Matrix credentials:
     ```sql
     UPDATE "user" SET matrix_user_id = NULL, matrix_access_token = NULL, matrix_device_id = NULL;
     ```

6. **Test Integration**
   - Verify user provisioning works
   - Verify room creation
   - Verify messaging

## User Experience

Users will need to re-authenticate to Matrix automatically. This happens when:
- Users access an event/group chat
- Users send/receive direct messages

The process will be transparent to users - new credentials will be provisioned automatically on their next interaction.

## Deployment Timeline

1. Schedule maintenance window (30 minutes)
2. Make database backup
3. Follow reset procedure above
4. Verify integration works
5. Monitor for issues

## Rollback Plan

If issues persist:
1. Restore database if needed
2. Re-deploy previous Matrix image
3. Fall back to previous chat implementation temporarily