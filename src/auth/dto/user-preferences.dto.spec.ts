import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  UserPreferencesDto,
  AnalyticsPreferencesDto,
} from './user-preferences.dto';

describe('UserPreferencesDto', () => {
  describe('AnalyticsPreferencesDto', () => {
    it('should accept valid optOut boolean (true)', async () => {
      const dto = plainToInstance(AnalyticsPreferencesDto, { optOut: true });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid optOut boolean (false)', async () => {
      const dto = plainToInstance(AnalyticsPreferencesDto, { optOut: false });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty object (optOut is optional)', async () => {
      const dto = plainToInstance(AnalyticsPreferencesDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-boolean optOut', async () => {
      const dto = plainToInstance(AnalyticsPreferencesDto, {
        optOut: 'yes',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('optOut');
    });
  });

  describe('UserPreferencesDto', () => {
    it('should accept valid analytics preferences', async () => {
      const dto = plainToInstance(UserPreferencesDto, {
        analytics: { optOut: true },
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty object (analytics is optional)', async () => {
      const dto = plainToInstance(UserPreferencesDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject analytics with invalid optOut type', async () => {
      const dto = plainToInstance(UserPreferencesDto, {
        analytics: { optOut: 'not-a-boolean' },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
