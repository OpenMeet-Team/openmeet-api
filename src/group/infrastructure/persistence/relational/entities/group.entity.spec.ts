import { GroupEntity } from './group.entity';
import { SLUG_REGEX } from '../../../../../core/constants/constant';
import * as shortCodeModule from '../../../../../utils/short-code';

describe('GroupEntity', () => {
  describe('generateSlug', () => {
    it('should generate a valid slug from a simple name', () => {
      const group = new GroupEntity();
      group.name = 'Test Group';

      group.generateSlug();

      // Slug should be "test-group-XXXXXX" where XXXXXX is a short code
      expect(group.slug).toMatch(/^test-group-[a-z0-9_-]+$/);
      expect(SLUG_REGEX.test(group.slug)).toBe(true);
    });

    it('should generate a valid slug from a name ending with special characters', () => {
      const group = new GroupEntity();
      group.name = 'Test Group!';

      group.generateSlug();

      // Slug should NOT have trailing hyphen before the short code
      // i.e., should be "test-group-XXXXXX" not "test-group--XXXXXX"
      expect(group.slug).not.toContain('--');
      expect(SLUG_REGEX.test(group.slug)).toBe(true);
    });

    it('should generate a valid slug from a name ending with multiple special characters', () => {
      const group = new GroupEntity();
      group.name = 'Test Group!!!';

      group.generateSlug();

      // Slug should NOT have trailing hyphens before the short code
      expect(group.slug).not.toContain('--');
      expect(SLUG_REGEX.test(group.slug)).toBe(true);
    });

    it('should generate a valid slug from a name with trailing spaces', () => {
      const group = new GroupEntity();
      group.name = 'Test Group   ';

      group.generateSlug();

      expect(group.slug).not.toContain('--');
      expect(SLUG_REGEX.test(group.slug)).toBe(true);
    });

    it('should generate a valid slug from a name with special characters throughout', () => {
      const group = new GroupEntity();
      group.name = 'Test & Group @ Here!';

      group.generateSlug();

      // Should handle special characters without creating double hyphens
      expect(group.slug).not.toMatch(/--+/);
      expect(SLUG_REGEX.test(group.slug)).toBe(true);
    });

    it('should NOT overwrite existing slug', () => {
      const group = new GroupEntity();
      group.slug = 'existing-slug-abc123';
      group.name = 'New Name';

      group.generateSlug();

      expect(group.slug).toBe('existing-slug-abc123');
    });

    it('should strip trailing hyphens when short code ends with hyphen', () => {
      // Mock generateShortCode to return a value ending with hyphen
      const spy = jest
        .spyOn(shortCodeModule, 'generateShortCode')
        .mockReturnValue('abc12-');

      const group = new GroupEntity();
      group.name = 'Test Group';

      group.generateSlug();

      // Slug should NOT end with a hyphen - SLUG_REGEX rejects trailing hyphens
      expect(group.slug).not.toMatch(/-$/);
      expect(SLUG_REGEX.test(group.slug)).toBe(true);

      spy.mockRestore();
    });

    it('should strip multiple trailing hyphens when short code ends with multiple hyphens', () => {
      // Mock generateShortCode to return a value ending with multiple hyphens
      const spy = jest
        .spyOn(shortCodeModule, 'generateShortCode')
        .mockReturnValue('ab---');

      const group = new GroupEntity();
      group.name = 'Test Group';

      group.generateSlug();

      // Slug should NOT end with hyphens
      expect(group.slug).not.toMatch(/-$/);
      expect(SLUG_REGEX.test(group.slug)).toBe(true);

      spy.mockRestore();
    });
  });

  describe('generateUlid', () => {
    it('should generate ulid when not set', () => {
      const group = new GroupEntity();

      group.generateUlid();

      expect(group.ulid).toBeDefined();
      expect(group.ulid).toHaveLength(26);
      expect(group.ulid).toMatch(/^[0-9a-z]{26}$/);
    });

    it('should NOT overwrite existing ulid', () => {
      const group = new GroupEntity();
      const existingUlid = '01hqvxz6j8k9m0n1p2q3r4s5t6';
      group.ulid = existingUlid;

      group.generateUlid();

      expect(group.ulid).toBe(existingUlid);
    });
  });
});
