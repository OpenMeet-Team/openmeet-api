# Messaging Permissions Refactor Design

## Overview

This document outlines the strategy for refactoring messaging permissions to separate communication permissions from management permissions, ensuring proper separation of concerns while maintaining backwards compatibility during migration.

## Current State Problems

### Incorrect Permission Usage
- `ManageMembers` permission is incorrectly used for messaging functionality
- No specific permission for members to contact group admins
- Messaging and membership management are conflated
- Inconsistent permission patterns across the system

### Current Misuse Locations
- **Backend** (`group.controller.ts` lines 317, 343): admin-message endpoints use `ManageMembers`
- **Frontend** (`GroupStickyComponent.vue` line 92): "Send Message to Members" button uses `ManageMembers`

## Target Permission Model

### New Permission Structure
```typescript
// Management Permissions (administrative actions)
ManageMembers = 'MANAGE_MEMBERS'     // Add/remove/approve members, change roles

// Communication Permissions  
MessageDiscussion = 'MESSAGE_DISCUSSION'  // Post in group discussion/chat rooms (bidirectional)
ContactMembers = 'CONTACT_MEMBERS'        // Send broadcasts to group members (one-way: admin → members)  
ContactAdmins = 'CONTACT_ADMINS'          // Send escalation messages to leadership (one-way: members → admins)
```

### Permission Categories
- **Contact*** = One-way messaging/notifications (what currently exists)
- **Message*** = Interactive/bidirectional communication (discussion rooms)
- **Manage*** = Administrative actions (membership management, not communication)

### Role Assignments (Target State)
```typescript
Owner: [ManageMembers, ContactMembers, ContactAdmins, MessageDiscussion, ...]
Admin: [ManageMembers, ContactMembers, ContactAdmins, MessageDiscussion, ...]  
Moderator: [ContactAdmins, MessageDiscussion, ...]
Member: [ContactAdmins, MessageDiscussion, ...]
Guest: [] // No communication permissions until approved
```

## Migration Strategy

### Phase 1: Add New Permissions
**Goal**: Add new permissions without breaking existing functionality

**Steps**:
1. Add `ContactMembers` and `ContactAdmins` to `GroupPermission` enum
2. Update group permission seeding to include new permissions
3. Run seeding to create permission records in database
4. Update platform TypeScript types

**Risk**: Low - additive changes only

### Phase 2: Data Migration  
**Goal**: Assign new permissions to existing users based on current roles

**Database Migrations Required**:
```sql
-- Grant ContactMembers to all users who currently have ManageMembers
INSERT INTO group_role_permissions (group_role_id, group_permission_id)
SELECT gr.id, gp.id 
FROM group_roles gr, group_permissions gp
WHERE gp.name = 'CONTACT_MEMBERS' 
  AND gr.id IN (
    SELECT DISTINCT grp.group_role_id 
    FROM group_role_permissions grp
    JOIN group_permissions gp2 ON grp.group_permission_id = gp2.id  
    WHERE gp2.name = 'MANAGE_MEMBERS'
  );

-- Grant ContactAdmins to all group members (except guests)
INSERT INTO group_role_permissions (group_role_id, group_permission_id)  
SELECT gr.id, gp.id
FROM group_roles gr, group_permissions gp
WHERE gp.name = 'CONTACT_ADMINS'
  AND gr.name IN ('member', 'moderator', 'admin', 'owner');
```

**Risk**: Medium - requires careful testing of permission assignments

### Phase 3: Code Migration
**Goal**: Update application code to use new permissions

**Backend Changes**:
- Update `group.controller.ts` endpoints to use `ContactMembers` instead of `ManageMembers`
- Add permission guards for `ContactAdmins` endpoint if missing

**Frontend Changes**:  
- Update `GroupStickyComponent.vue` to check `ContactMembers` permission
- Search for any other UI elements using `ManageMembers` for messaging

**Risk**: Medium - could break functionality if permissions not properly assigned

### Phase 4: Validation & Cleanup
**Goal**: Ensure migration success and clean up legacy code

**Steps**:
1. Validate that all existing messaging functionality still works
2. Test new `ContactAdmins` functionality  
3. Remove any temporary backwards compatibility code
4. Update documentation and tests

**Risk**: Low - validation and cleanup

## Implementation Checklist

### High Priority (Required for Migration)
- [ ] Add `ContactMembers` permission to GroupPermission enum
- [ ] Add `ContactAdmins` permission to GroupPermission enum  
- [ ] Update group role seeding with new permissions
- [ ] Create database migration scripts for existing users
- [ ] Replace `ManageMembers` with `ContactMembers` in admin-message endpoints
- [ ] Update GroupStickyComponent.vue permission check
- [ ] Update platform TypeScript types

### Medium Priority (Clean Architecture)  
- [ ] Search frontend for other `ManageMembers` messaging usage
- [ ] Add permission guard to contact-admins endpoint if missing
- [ ] Update tests to reflect new permission model
- [ ] Document new permission patterns

### Low Priority (Future Enhancement)
- [ ] Consider adding `MessageMembers` for true bidirectional messaging
- [ ] Audit all permission usage for consistency
- [ ] Add permission hierarchy/inheritance if beneficial

## Deployment Strategy

### Pre-Deployment
1. **Database Preparation**: Run permission seeding and migration scripts
2. **Testing**: Validate permissions in staging environment  
3. **Rollback Plan**: Document how to revert permission changes

### Deployment Order
1. **Deploy Permission Updates**: New permissions and role assignments
2. **Deploy Code Changes**: Updated controllers and frontend
3. **Validation**: Test all messaging functionality post-deployment
4. **Monitor**: Watch for permission-related errors

### Rollback Strategy
- Keep `ManageMembers` checks temporarily during transition
- Use feature flags if needed for gradual rollout
- Database rollback scripts for permission assignments

## Risk Assessment

**High Risk**:
- Breaking existing admin messaging functionality
- Users losing access to messaging features

**Mitigation**:
- Thorough testing in staging environment
- Gradual deployment with monitoring
- Backwards compatibility during transition period

**Medium Risk**:
- Incorrect permission assignments in migration
- Missing edge cases in permission logic

**Mitigation**:
- Comprehensive migration scripts testing
- Manual validation of permission assignments
- Detailed logging during migration

## Success Criteria

1. All existing messaging functionality continues to work
2. New `ContactAdmins` feature works for group members
3. `ManageMembers` no longer controls messaging access
4. Clear separation between management and communication permissions
5. Zero downtime during migration
6. No user complaints about lost functionality

## Future Considerations

### True Bidirectional Messaging
When implementing real messaging features:
- `MessageMembers` = Direct member-to-member messaging
- `MessageAdmins` = Direct member-to-admin messaging  
- Keep `Contact*` permissions for form-based communication

### Permission Hierarchy
Consider implementing permission inheritance:
- Higher roles automatically get lower role permissions
- Simplify permission management
- Reduce complexity in role assignments

### Permission Groups
Group related permissions for easier management:
- Communication permissions group
- Management permissions group  
- Visibility permissions group