# Messaging System Testing Plan

## Priority 1: Critical Path Tests (Must Have)

### Unit Tests - Core Services

**MessageSenderService**
- ✅ Should send email successfully and return external ID
- ✅ Should handle email sending failures gracefully
- ✅ Should pass through template and context data correctly

**MessageLoggerService**
- ✅ Should log successful email to database
- ✅ Should log failed email with error details
- ✅ Should handle database unavailable gracefully (return false, don't crash)
- ✅ Should create proper metadata for system emails

**MessagePolicyService**
- ✅ Should allow email when policies pass
- ✅ Should block email when rate limit exceeded
- ✅ Should block email when messaging is paused
- ✅ Should allow critical system emails through pause
- ✅ Should log policy violations

**EventEmailService (Integration)**
- ✅ Should send role update email successfully (happy path)
- ✅ Should handle user not found gracefully
- ✅ Should respect policy blocks (rate limit/pause)
- ✅ Should log success and failure appropriately

### Integration Tests - Event Listeners

**GroupEmailListener**
- ✅ Should receive group.member.role.updated event
- ✅ Should send email through EventEmailService
- ✅ Should handle missing event data gracefully
- ✅ Should not crash on email failures

## Priority 2: Edge Case Tests (Should Have)

### Unit Tests - Error Handling

**MessageSenderService**
- ✅ Should handle malformed email addresses
- ✅ Should handle missing tenant context

**MessageLoggerService**
- ✅ Should handle tenant connection failures
- ✅ Should handle database schema not found
- ✅ Should handle concurrent logging requests

**MessagePolicyService**
- ✅ Should handle audit service failures
- ✅ Should handle pause service failures
- ✅ Should default to allowing when policy checks fail

### Integration Tests - Service Composition

**EventEmailService**
- ✅ Should handle partial failures (email sent but logging failed)
- ✅ Should handle UserService failures
- ✅ Should compose all services correctly in success flow

## Priority 3: System Tests (Nice to Have)

### E2E Tests - Real World Scenarios

**Role Change Flow**
- ✅ Should send email when group member role changes
- ✅ Should log email activity to database
- ✅ Should respect rate limits across multiple role changes
- ✅ Should handle concurrent role changes properly

**Policy Enforcement**
- ✅ Should block emails when messaging is paused
- ✅ Should allow critical emails during pause
- ✅ Should enforce rate limits per user/group

## Testing Strategy

### Test Doubles Strategy
```typescript
// Mock external dependencies only
- Mock IEmailSender (focus on our logic, not email provider)
- Mock TenantConnectionService (focus on our logic, not DB)
- Mock UserService (focus on messaging logic, not user lookup)
- Real EventEmitter (test actual event flow)
```

### Test Data Strategy
```typescript
// Use realistic test data
- Valid tenant IDs and user slugs
- Realistic email addresses
- Proper event payloads
- Edge case inputs (null, undefined, empty strings)
```

### Performance Considerations
```typescript
// Test resource usage
- Memory leaks in event listeners
- Database connection cleanup
- Email sending timeout handling
```

## Implementation Priority

### Phase 1: Core Functionality (Week 1)
1. MessageSenderService unit tests
2. EventEmailService integration tests
3. GroupEmailListener event tests

### Phase 2: Reliability (Week 2)
1. MessageLoggerService unit tests
2. MessagePolicyService unit tests
3. Error handling edge cases

### Phase 3: System Validation (Week 3)
1. E2E role change flow test
2. Policy enforcement tests
3. Performance and cleanup tests

## Success Criteria

### Coverage Targets
- **Unit Tests**: 90%+ coverage on core services
- **Integration Tests**: All public API methods tested
- **E2E Tests**: Complete happy path + critical failure paths

### Quality Gates
- ✅ All tests pass consistently
- ✅ No memory leaks in event listeners
- ✅ Graceful degradation when dependencies fail
- ✅ Proper error logging for debugging
- ✅ Performance within acceptable limits

## Test Files to Create

```
src/messaging/services/
├── message-sender.service.spec.ts
├── message-logger.service.spec.ts
├── message-policy.service.spec.ts
└── event-email.service.spec.ts

src/messaging/listeners/
└── group-email.listener.spec.ts

test/messaging/
├── role-change-email.e2e-spec.ts
└── messaging-policies.e2e-spec.ts
```

## What We DON'T Need to Test

❌ Third-party email provider internals  
❌ Database driver functionality  
❌ NestJS event emitter internals  
❌ User service business logic  
❌ Tenant connection management  

Focus on **our business logic** and **service composition**.