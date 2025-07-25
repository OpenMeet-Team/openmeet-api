# Known Bugs

## Matrix Bot Profile Display Name Bug

**Date Discovered**: 2025-07-22  
**Status**: Open  
**Priority**: Medium  
**Component**: Matrix Application Service / Bot Integration  

### Problem Description

Matrix server (Synapse) throws a `TypeError: 'NoneType' object is not subscriptable` when our OpenMeet bot attempts to set its display name during room creation operations.

### Error Details

```
TypeError: 'NoneType' object is not subscriptable
File "/usr/local/lib/python3.12/site-packages/synapse/storage/databases/main/profile.py", line 356, in _check_profile_size
```

### Reproduction

1. Run E2E tests that create Matrix rooms via Application Service
2. Bot attempts to set display name via `PUT /_matrix/client/v3/profile/@openmeet-bot:matrix.openmeet.net/displayname`
3. Matrix server's `_check_profile_size` function encounters a `None` value where it expects a database row
4. Function tries to access `row[0]` on a `None` object, causing TypeError

### Environment Impact

- ✅ **Local Development**: Reproduced consistently
- ✅ **CI Environment**: Reproduced consistently  
- ❌ **Production**: Unknown/Not tested

### Root Cause Analysis

**Exact cause identified**: In commit `70db2cbfe3bac0d80bc740043823537a89124814` (July 13, 2025), bot configuration was removed from Matrix config during "tenant-based authentication" refactor.

**What was removed**:
```diff
-  // Bot configuration (current implementation)  
-  bot: {
-    username: string;
-    password?: string;
-    displayName: string;
-  };
+  // Bot configuration moved to tenant-based config (see MatrixBotUserService)
```

**The problem**: 
1. Application Service config (`matrix-config/openmeet-appservice.gomplate.yaml`) defines bot user namespaces
2. But bot profile initialization was removed from the main config
3. When Application Service tries to set display names for bots, no profile exists in Matrix database
4. Matrix's `_check_profile_size` gets `None` instead of a profile row, causing the TypeError

**Affected operations**:
- Bot display name setting during room creation
- Profile operations for Application Service users (@openmeet-bot-*)

### Impact Assessment

- **Functionality**: Low - Core application features work normally
- **User Experience**: Low - Users don't see the impact directly  
- **Logging/Monitoring**: Medium - Generates ERROR logs in Matrix server
- **Test Reliability**: Low - Tests still pass, but produce server errors

### Next Steps

1. **Immediate Fix Options**:
   - **Option A**: Restore bot profile initialization in Application Service startup
   - **Option B**: Skip display name setting for Application Service bots 
   - **Option C**: Add proper error handling for failed profile operations

2. **Recommended Fix**: Option A - Restore bot profile initialization
   - Find where `MatrixBotUserService` is supposed to handle tenant-based bot config
   - Ensure bots get proper Matrix profiles created before display name operations
   - Update Application Service startup to initialize bot profiles

3. **Validation**: Confirm fix eliminates the TypeError in both local and CI environments

**Files to investigate**:
- `src/matrix/services/matrix-bot-user.service.ts` (mentioned in commit)  
- Application Service initialization code
- Bot startup/registration logic

### Workaround

Currently, the error doesn't break functionality - it's safely handled by the Matrix server returning HTTP 500, and our application continues operating normally.

### Related Files

- Matrix bot initialization code in Application Service
- Matrix profile handling in bot service
- E2E tests: `test/matrix/matrix-room-alias-invitation.e2e-spec.ts`
- Matrix server logs showing the TypeError

### References

- Matrix server error occurred during E2E test execution
- Error pattern identical in both local Docker environment and CI
- Tests continue to pass despite the profile operation failure