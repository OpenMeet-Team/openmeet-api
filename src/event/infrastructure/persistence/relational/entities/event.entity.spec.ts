import { EventEntity } from './event.entity';
import { SLUG_REGEX } from '../../../../../core/constants/constant';
import * as shortCodeModule from '../../../../../utils/short-code';

describe('EventEntity', () => {
  describe('generateSlug', () => {
    it('should generate a valid slug from a simple name', () => {
      const event = new EventEntity();
      event.name = 'Test Event';

      event.generateSlug();

      // Slug should be "test-event-XXXXXX" where XXXXXX is a short code
      expect(event.slug).toMatch(/^test-event-[a-z0-9_-]+$/);
      expect(SLUG_REGEX.test(event.slug)).toBe(true);
    });

    it('should generate a valid slug from a name ending with special characters', () => {
      const event = new EventEntity();
      event.name = 'Test Event!';

      event.generateSlug();

      // Slug should NOT have trailing hyphens
      expect(event.slug).not.toMatch(/-$/);
      expect(SLUG_REGEX.test(event.slug)).toBe(true);
    });

    it('should NOT overwrite existing slug', () => {
      const event = new EventEntity();
      event.slug = 'existing-slug-abc123';
      event.name = 'New Name';

      event.generateSlug();

      expect(event.slug).toBe('existing-slug-abc123');
    });

    it('should strip trailing hyphens when short code ends with hyphen', () => {
      // Mock generateShortCode to return a value ending with hyphen
      // Note: Event entity concatenates BEFORE slugify, so slugify handles this
      const spy = jest
        .spyOn(shortCodeModule, 'generateShortCode')
        .mockReturnValue('abc12-');

      const event = new EventEntity();
      event.name = 'Test Event';

      event.generateSlug();

      // Slug should NOT end with a hyphen - slugify with strict:true strips trailing hyphens
      expect(event.slug).not.toMatch(/-$/);
      expect(SLUG_REGEX.test(event.slug)).toBe(true);

      spy.mockRestore();
    });

    it('should strip multiple trailing hyphens when short code ends with multiple hyphens', () => {
      // Mock generateShortCode to return a value ending with multiple hyphens
      const spy = jest
        .spyOn(shortCodeModule, 'generateShortCode')
        .mockReturnValue('ab---');

      const event = new EventEntity();
      event.name = 'Test Event';

      event.generateSlug();

      // Slug should NOT end with hyphens
      expect(event.slug).not.toMatch(/-$/);
      expect(SLUG_REGEX.test(event.slug)).toBe(true);

      spy.mockRestore();
    });
  });

  describe('generateUlid', () => {
    it('should generate ulid when not set', () => {
      const event = new EventEntity();

      event.generateUlid();

      expect(event.ulid).toBeDefined();
      expect(event.ulid).toHaveLength(26);
      expect(event.ulid).toMatch(/^[0-9a-z]{26}$/);
    });

    it('should NOT overwrite existing ulid', () => {
      const event = new EventEntity();
      const existingUlid = '01hqvxz6j8k9m0n1p2q3r4s5t6';
      event.ulid = existingUlid;

      event.generateUlid();

      expect(event.ulid).toBe(existingUlid);
    });
  });
});
