/**
 * Unit tests for Quick RSVP business logic
 * Focus on: name parsing, email normalization, validation rules
 * Integration/E2E tests handle the full flow
 */
describe('AuthService - Quick RSVP Business Logic', () => {
  // TODO: Add minimal service setup when implementing quickRsvp method

  describe('Name parsing', () => {
    it.todo('should split "John Doe" into firstName="John", lastName="Doe"');
    it.todo(
      'should split "John Jacob Smith" into firstName="John", lastName="Jacob Smith"',
    );
    it.todo(
      'should handle single name "Madonna" as firstName="Madonna", lastName=""',
    );
    it.todo('should trim whitespace from names');
    it.todo('should handle multiple spaces between names');
  });

  describe('Email normalization', () => {
    it.todo('should convert email to lowercase');
    it.todo('should preserve email with mixed case in domain');
  });

  describe('Event validation', () => {
    it.todo('should throw NotFoundException if event does not exist');
    it.todo(
      'should throw ForbiddenException if event has groupId (member-only)',
    );
    it.todo('should allow RSVP if event has no groupId (public event)');
  });

  describe('Idempotency', () => {
    it.todo('should return success if user already has RSVP for this event');
    it.todo('should not create duplicate RSVPs');
  });
});
