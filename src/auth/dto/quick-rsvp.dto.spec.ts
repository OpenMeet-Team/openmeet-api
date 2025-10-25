import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { QuickRsvpDto } from './quick-rsvp.dto';

describe('QuickRsvpDto', () => {
  describe('validation', () => {
    it('should validate successfully with valid data', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: 'John Doe',
        email: 'john@example.com',
        eventSlug: 'summer-party-2024',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when name is empty', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: '',
        email: 'john@example.com',
        eventSlug: 'summer-party-2024',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('name');
    });

    it('should fail when name is missing', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        email: 'john@example.com',
        eventSlug: 'summer-party-2024',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const nameError = errors.find((e) => e.property === 'name');
      expect(nameError).toBeDefined();
    });

    it('should fail when email is invalid format', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: 'John Doe',
        email: 'not-an-email',
        eventSlug: 'summer-party-2024',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('should fail when email is missing', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: 'John Doe',
        eventSlug: 'summer-party-2024',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const emailError = errors.find((e) => e.property === 'email');
      expect(emailError).toBeDefined();
    });

    it('should transform email to lowercase', () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: 'John Doe',
        email: 'JOHN@EXAMPLE.COM',
        eventSlug: 'summer-party-2024',
      });

      expect(dto.email).toBe('john@example.com');
    });

    it('should fail when eventSlug is empty', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: 'John Doe',
        email: 'john@example.com',
        eventSlug: '',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('eventSlug');
    });

    it('should fail when eventSlug is missing', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: 'John Doe',
        email: 'john@example.com',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const eventSlugError = errors.find((e) => e.property === 'eventSlug');
      expect(eventSlugError).toBeDefined();
    });

    it('should accept email with plus addressing', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: 'John Doe',
        email: 'john+test@example.com',
        eventSlug: 'summer-party-2024',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept name with special characters', async () => {
      const dto = plainToInstance(QuickRsvpDto, {
        name: "O'Brien-Smith",
        email: 'john@example.com',
        eventSlug: 'summer-party-2024',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
