import { EventSeriesEntity } from './event-series.entity';
import { SLUG_REGEX } from '../../../../../core/constants/constant';
import * as shortCodeModule from '../../../../../utils/short-code';

describe('EventSeriesEntity', () => {
  describe('generateSlug', () => {
    it('should generate a valid slug from a simple name', () => {
      const series = new EventSeriesEntity();
      series.name = 'Test Series';

      series.generateSlug();

      // Slug should be "test-series-XXXXXX" where XXXXXX is a short code
      expect(series.slug).toMatch(/^test-series-[a-z0-9_-]+$/);
      expect(SLUG_REGEX.test(series.slug)).toBe(true);
    });

    it('should generate a valid slug from a name ending with special characters', () => {
      const series = new EventSeriesEntity();
      series.name = 'Test Series!';

      series.generateSlug();

      // Slug should NOT have trailing hyphens
      expect(series.slug).not.toMatch(/-$/);
      expect(SLUG_REGEX.test(series.slug)).toBe(true);
    });

    it('should NOT overwrite existing slug', () => {
      const series = new EventSeriesEntity();
      series.slug = 'existing-slug-abc123';
      series.name = 'New Name';

      series.generateSlug();

      expect(series.slug).toBe('existing-slug-abc123');
    });

    it('should strip trailing hyphens when short code ends with hyphen', () => {
      // Mock generateShortCode to return a value ending with hyphen
      // Note: EventSeries entity concatenates BEFORE slugify, so slugify handles this
      const spy = jest
        .spyOn(shortCodeModule, 'generateShortCode')
        .mockReturnValue('abc12-');

      const series = new EventSeriesEntity();
      series.name = 'Test Series';

      series.generateSlug();

      // Slug should NOT end with a hyphen - slugify with strict:true strips trailing hyphens
      expect(series.slug).not.toMatch(/-$/);
      expect(SLUG_REGEX.test(series.slug)).toBe(true);

      spy.mockRestore();
    });

    it('should strip multiple trailing hyphens when short code ends with multiple hyphens', () => {
      // Mock generateShortCode to return a value ending with multiple hyphens
      const spy = jest
        .spyOn(shortCodeModule, 'generateShortCode')
        .mockReturnValue('ab---');

      const series = new EventSeriesEntity();
      series.name = 'Test Series';

      series.generateSlug();

      // Slug should NOT end with hyphens
      expect(series.slug).not.toMatch(/-$/);
      expect(SLUG_REGEX.test(series.slug)).toBe(true);

      spy.mockRestore();
    });
  });

  describe('generateUlid', () => {
    it('should generate ulid when not set', () => {
      const series = new EventSeriesEntity();

      series.generateUlid();

      expect(series.ulid).toBeDefined();
      expect(series.ulid).toHaveLength(26);
      expect(series.ulid).toMatch(/^[0-9a-z]{26}$/);
    });

    it('should NOT overwrite existing ulid', () => {
      const series = new EventSeriesEntity();
      const existingUlid = '01hqvxz6j8k9m0n1p2q3r4s5t6';
      series.ulid = existingUlid;

      series.generateUlid();

      expect(series.ulid).toBe(existingUlid);
    });
  });
});
