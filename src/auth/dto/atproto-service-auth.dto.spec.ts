import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AtprotoServiceAuthDto } from './atproto-service-auth.dto';

describe('AtprotoServiceAuthDto', () => {
  describe('validation', () => {
    it('should validate successfully with a valid token string', async () => {
      const dto = plainToInstance(AtprotoServiceAuthDto, {
        token:
          'eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJkaWQ6cGxjOi4uLiJ9.signature',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when token is missing', async () => {
      const dto = plainToInstance(AtprotoServiceAuthDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const tokenError = errors.find((e) => e.property === 'token');
      expect(tokenError).toBeDefined();
    });

    it('should fail when token is empty string', async () => {
      const dto = plainToInstance(AtprotoServiceAuthDto, {
        token: '',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const tokenError = errors.find((e) => e.property === 'token');
      expect(tokenError).toBeDefined();
    });

    it('should fail when token is not a string', async () => {
      const dto = plainToInstance(AtprotoServiceAuthDto, {
        token: 12345,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const tokenError = errors.find((e) => e.property === 'token');
      expect(tokenError).toBeDefined();
    });
  });
});
