import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { VerifyEmailCodeDto } from './verify-email-code.dto';

describe('VerifyEmailCodeDto', () => {
  describe('validation', () => {
    it('should validate successfully with valid code and email', async () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        code: 'abc123def456',
        email: 'user@example.com',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should transform email to lowercase', () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        code: '123456',
        email: 'USER@EXAMPLE.COM',
      });

      expect(dto.email).toBe('user@example.com');
    });

    it('should fail when code is empty', async () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        code: '',
        email: 'user@example.com',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('code');
    });

    it('should fail when code is missing', async () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        email: 'user@example.com',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const codeError = errors.find((e) => e.property === 'code');
      expect(codeError).toBeDefined();
    });

    it('should fail when email is missing', async () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        code: '123456',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const emailError = errors.find((e) => e.property === 'email');
      expect(emailError).toBeDefined();
    });

    it('should fail when email is invalid', async () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        code: '123456',
        email: 'not-an-email',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const emailError = errors.find((e) => e.property === 'email');
      expect(emailError).toBeDefined();
    });

    it('should accept numeric code', async () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        code: '123456',
        email: 'user@example.com',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept hex code from TempAuthCodeService', async () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        code: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234',
        email: 'user@example.com',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept code with hyphens', async () => {
      const dto = plainToInstance(VerifyEmailCodeDto, {
        code: 'abc-123-def-456',
        email: 'user@example.com',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
