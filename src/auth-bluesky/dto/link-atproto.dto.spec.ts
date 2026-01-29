import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LinkAtprotoDto } from './link-atproto.dto';

describe('LinkAtprotoDto', () => {
  async function validateDto(data: Partial<LinkAtprotoDto>) {
    const dto = plainToInstance(LinkAtprotoDto, data);
    return validate(dto);
  }

  describe('handle validation', () => {
    it('should accept a valid handle', async () => {
      const errors = await validateDto({ handle: 'alice.bsky.social' });
      expect(errors).toHaveLength(0);
    });

    it('should accept a handle with subdomains', async () => {
      const errors = await validateDto({ handle: 'alice.sub.bsky.social' });
      expect(errors).toHaveLength(0);
    });

    it('should reject a handle without a dot', async () => {
      const errors = await validateDto({ handle: 'alice' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject an empty string', async () => {
      const errors = await validateDto({ handle: '' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a handle with spaces', async () => {
      const errors = await validateDto({ handle: 'alice .bsky.social' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a handle starting with a dot', async () => {
      const errors = await validateDto({ handle: '.alice.bsky.social' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a handle ending with a dot', async () => {
      const errors = await validateDto({ handle: 'alice.bsky.social.' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a handle with special characters', async () => {
      const errors = await validateDto({ handle: 'al!ce.bsky.social' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a handle that is too short', async () => {
      const errors = await validateDto({ handle: 'ab' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept a handle with hyphens', async () => {
      const errors = await validateDto({ handle: 'alice-bob.bsky.social' });
      expect(errors).toHaveLength(0);
    });

    it('should reject a handle with a segment starting with hyphen', async () => {
      const errors = await validateDto({ handle: '-alice.bsky.social' });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a handle with a segment ending with hyphen', async () => {
      const errors = await validateDto({ handle: 'alice-.bsky.social' });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('platform validation', () => {
    it('should accept android platform', async () => {
      const errors = await validateDto({
        handle: 'alice.bsky.social',
        platform: 'android',
      });
      expect(errors).toHaveLength(0);
    });

    it('should accept ios platform', async () => {
      const errors = await validateDto({
        handle: 'alice.bsky.social',
        platform: 'ios',
      });
      expect(errors).toHaveLength(0);
    });

    it('should accept web platform', async () => {
      const errors = await validateDto({
        handle: 'alice.bsky.social',
        platform: 'web',
      });
      expect(errors).toHaveLength(0);
    });

    it('should accept missing platform (optional)', async () => {
      const errors = await validateDto({ handle: 'alice.bsky.social' });
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid platform', async () => {
      const errors = await validateDto({
        handle: 'alice.bsky.social',
        platform: 'desktop' as any,
      });
      expect(errors.length).toBeGreaterThan(0);
      const platformError = errors.find((e) => e.property === 'platform');
      expect(platformError?.constraints?.isIn).toContain(
        'Platform must be one of: android, ios, web',
      );
    });
  });
});
