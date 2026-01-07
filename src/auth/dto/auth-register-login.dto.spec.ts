import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AuthRegisterLoginDto } from './auth-register-login.dto';

describe('AuthRegisterLoginDto', () => {
  describe('validation', () => {
    it('should validate successfully with valid data', async () => {
      const dto = plainToInstance(AuthRegisterLoginDto, {
        email: 'test@example.com',
        password: 'secret123',
        firstName: 'John',
        lastName: 'Doe',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when email is invalid', async () => {
      const dto = plainToInstance(AuthRegisterLoginDto, {
        email: 'not-an-email',
        password: 'secret123',
        firstName: 'John',
        lastName: 'Doe',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('should fail when password is too short', async () => {
      const dto = plainToInstance(AuthRegisterLoginDto, {
        email: 'test@example.com',
        password: '12345', // less than 6 characters
        firstName: 'John',
        lastName: 'Doe',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('password');
    });

    it('should fail when firstName is empty', async () => {
      const dto = plainToInstance(AuthRegisterLoginDto, {
        email: 'test@example.com',
        password: 'secret123',
        firstName: '',
        lastName: 'Doe',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const firstNameError = errors.find((e) => e.property === 'firstName');
      expect(firstNameError).toBeDefined();
    });

    it('should allow empty lastName for single-name users', async () => {
      const dto = plainToInstance(AuthRegisterLoginDto, {
        email: 'cher@example.com',
        password: 'secret123',
        firstName: 'Cher',
        lastName: '',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should allow missing lastName for single-name users', async () => {
      const dto = plainToInstance(AuthRegisterLoginDto, {
        email: 'madonna@example.com',
        password: 'secret123',
        firstName: 'Madonna',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should transform email to lowercase', () => {
      const dto = plainToInstance(AuthRegisterLoginDto, {
        email: 'TEST@EXAMPLE.COM',
        password: 'secret123',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(dto.email).toBe('test@example.com');
    });
  });
});
