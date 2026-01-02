import { UserEntity } from './user.entity';

describe('UserEntity', () => {
  describe('generateSlug', () => {
    it('should generate slug with firstName and lastName when both are set', () => {
      const user = new UserEntity();
      user.firstName = 'John';
      user.lastName = 'Doe';

      user.generateSlug();

      // Slug should be "john-doe-XXXXXX" where XXXXXX is a short code
      expect(user.slug).toMatch(/^john-doe-[a-z0-9_-]+$/);
    });

    it('should generate slug with only firstName when lastName is null', () => {
      const user = new UserEntity();
      user.firstName = 'John';
      user.lastName = null;

      user.generateSlug();

      // Slug should be "john-XXXXXX" where XXXXXX is a short code
      expect(user.slug).toMatch(/^john-[a-z0-9_-]+$/);
    });

    it('should generate slug with only lastName when firstName is null', () => {
      const user = new UserEntity();
      user.firstName = null;
      user.lastName = 'Doe';

      user.generateSlug();

      // Slug should be "doe-XXXXXX" where XXXXXX is a short code
      expect(user.slug).toMatch(/^doe-[a-z0-9_-]+$/);
    });

    it('should generate slug with "user" when both firstName and lastName are null', () => {
      const user = new UserEntity();
      user.firstName = null;
      user.lastName = null;

      user.generateSlug();

      // Slug should be "user-XXXXXX" where XXXXXX is a short code
      expect(user.slug).toMatch(/^user-[a-z0-9_-]+$/);
    });

    it('should NOT generate slug "null-null" when both names are null', () => {
      const user = new UserEntity();
      user.firstName = null;
      user.lastName = null;

      user.generateSlug();

      // This is the bug we're fixing - slug should NOT contain "null-null"
      expect(user.slug).not.toMatch(/null-null/);
      expect(user.slug).not.toMatch(/^null/);
    });

    it('should NOT overwrite existing slug', () => {
      const user = new UserEntity();
      user.slug = 'existing-slug-123456';
      user.firstName = 'John';
      user.lastName = 'Doe';

      user.generateSlug();

      expect(user.slug).toBe('existing-slug-123456');
    });

    it('should handle empty string firstName and lastName', () => {
      const user = new UserEntity();
      user.firstName = '' as any;
      user.lastName = '' as any;

      user.generateSlug();

      // Should fall back to "user" when both are empty strings
      expect(user.slug).toMatch(/^user-[a-z0-9_-]+$/);
    });

    it('should handle whitespace-only names', () => {
      const user = new UserEntity();
      user.firstName = '   ' as any;
      user.lastName = '   ' as any;

      user.generateSlug();

      // Should fall back to "user" when both are just whitespace
      expect(user.slug).toMatch(/^user-[a-z0-9_-]+$/);
    });
  });

  describe('generateUlid', () => {
    it('should generate ulid when not set', () => {
      const user = new UserEntity();

      user.generateUlid();

      expect(user.ulid).toBeDefined();
      expect(user.ulid).toHaveLength(26);
      expect(user.ulid).toMatch(/^[0-9a-z]{26}$/);
    });

    it('should NOT overwrite existing ulid', () => {
      const user = new UserEntity();
      const existingUlid = '01hqvxz6j8k9m0n1p2q3r4s5t6';
      user.ulid = existingUlid;

      user.generateUlid();

      expect(user.ulid).toBe(existingUlid);
    });
  });
});
