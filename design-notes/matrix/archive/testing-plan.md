# Matrix Chat: Phase 3 Testing Plan

## Overview

This document outlines the comprehensive testing strategy for the Matrix chat implementation in Phase 3. The goal is to verify that the real-time chat functionality works correctly across all contexts (direct messages, group chats, and event discussions).

## Test Environment

- **Staging Environment**: Use the staging environment with a dedicated Matrix Synapse server
- **Test Users**: Create at least 3 test users for multi-user testing scenarios
- **Browsers**: Test in Chrome, Firefox, and Safari
- **Devices**: Test on desktop and mobile devices

## Testing Approach

### 1. Automated Testing (Cypress)

Start with a basic test that verifies:
- User login works correctly
- Chat interface loads
- Basic chat components are present

As these pass, gradually add more complex tests:
- Sending and receiving messages
- Real-time updates via WebSockets
- Typing indicators
- Room joining
- Message history loading

### 2. Manual Testing Checklist

#### User Provisioning
- [ ] Verify new users get Matrix credentials automatically on first chat access
- [ ] Verify existing users without Matrix credentials get provisioned when accessing chat
- [ ] Check that user display names in Matrix match their OpenMeet display names

#### Direct Messages
- [ ] Start a new direct message conversation with another user
- [ ] Send messages and verify they appear for both users in real-time
- [ ] Verify typing indicators work in both directions
- [ ] Verify message history loads correctly when reopening a conversation
- [ ] Test with longer messages (1000+ characters)
- [ ] Test with special characters and emoji
- [ ] Verify user avatars display correctly

#### Group Chats
- [ ] Create a new group and verify chat room is created
- [ ] Add members to group and verify they can access the group chat
- [ ] Send messages as different users and verify real-time updates
- [ ] Verify correct permissions (owners/admins have moderator privileges)
- [ ] Test with 10+ users in a single group chat
- [ ] Verify notifications work when receiving messages

#### Event Discussions
- [ ] Create a new event and verify chat room is created
- [ ] Join an event as different users and verify access to event chat
- [ ] Send messages and verify real-time updates for all attendees
- [ ] Verify host/organizers have moderator privileges
- [ ] Test with 20+ attendees
- [ ] Verify event chat is accessible from event details page

#### WebSocket Functionality
- [ ] Verify WebSocket connection established on chat page load
- [ ] Test reconnection behavior (disconnect network, then reconnect)
- [ ] Check connection status indication (connected/disconnected)
- [ ] Test with multiple tabs open (verify updates across tabs)
- [ ] Monitor WebSocket connection stability over 1-hour period

#### Power Level Permissions
- [ ] Verify event creators get power level 50 (moderator)
- [ ] Verify group owners get power level 50
- [ ] Verify regular members get power level 0
- [ ] Test moderation actions (if implemented)

### 3. Performance Testing

#### Stress Testing
- [ ] Test with 50+ simultaneous users
- [ ] Test with 100+ messages sent in rapid succession
- [ ] Monitor server load during peak activity
- [ ] Check message delivery latency under load

#### Resource Usage
- [ ] Monitor memory usage on client (for WebSocket connection leak detection)
- [ ] Monitor Matrix server resource usage
- [ ] Check database query performance
- [ ] Test with simulated slow network conditions

### 4. User Journeys

Test complete user journeys that combine multiple features:

1. **New User Journey**
   - Register new account
   - Access chat for first time (should trigger Matrix provisioning)
   - Start a direct message conversation
   - Join a group and participate in group chat
   - RSVP to an event and participate in event chat

2. **Organizer Journey**
   - Create new event
   - Invite attendees
   - Post welcome message in event chat
   - Verify all attendees receive messages
   - Test before/during/after event time periods

3. **Group Admin Journey**
   - Create new group
   - Invite members
   - Create announcement in group chat
   - Verify all members receive message
   - Test moderation capabilities (if implemented)

## Monitoring & Logging

During testing, monitor:
- WebSocket connection logs
- Matrix API call logs
- Error rates in application logs
- Performance metrics (message delivery time, API response times)

## Test Reporting

Document all test results including:
- Screenshot evidence of successful tests
- Any failures or unexpected behavior
- Performance metrics
- Browser/device compatibility issues

## Rollback Plan

In case of critical issues, document the rollback procedure:
1. How to revert to previous chat implementation
2. Data preservation strategy
3. User communication plan

## Success Criteria

Phase 3 testing is considered successful when:
1. All automated tests pass consistently
2. Manual tests pass across all supported browsers/devices
3. Performance meets acceptable thresholds
4. No critical or high-severity bugs remain
5. User journeys complete successfully

## Next Steps

After successful testing, prepare for Phase 4 (Cutover):
1. Finalize migration scripts
2. Create deployment schedule
3. Prepare user communication
4. Schedule maintenance window