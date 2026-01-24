import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExternalEventLocationDto } from './external-event.dto';

describe('ExternalEventLocationDto', () => {
  describe('lat/lon transformation', () => {
    it('should accept numeric lat/lon values', async () => {
      const input = {
        lat: 59.358296,
        lon: 18.091465,
        description: 'Test Location',
      };

      const dto = plainToInstance(ExternalEventLocationDto, input);
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.lat).toBe(59.358296);
      expect(dto.lon).toBe(18.091465);
      expect(typeof dto.lat).toBe('number');
      expect(typeof dto.lon).toBe('number');
    });

    it('should transform string lat/lon to numbers (AT Protocol format)', async () => {
      const input = {
        lat: '59.35829640000001',
        lon: '18.0914655',
        description: 'Berghs School of Communication AB, Stockholm, Sweden',
      };

      const dto = plainToInstance(ExternalEventLocationDto, input);
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.lat).toBeCloseTo(59.358296, 5);
      expect(dto.lon).toBeCloseTo(18.091465, 5);
      expect(typeof dto.lat).toBe('number');
      expect(typeof dto.lon).toBe('number');
    });

    it('should handle negative coordinate strings', async () => {
      const input = {
        lat: '-33.8688',
        lon: '-151.2093',
        description: 'Sydney, Australia',
      };

      const dto = plainToInstance(ExternalEventLocationDto, input);
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.lat).toBeCloseTo(-33.8688, 4);
      expect(dto.lon).toBeCloseTo(-151.2093, 4);
    });

    it('should allow location without coordinates', async () => {
      const input = {
        description: 'Online Event',
        url: 'https://meet.google.com/xyz',
      };

      const dto = plainToInstance(ExternalEventLocationDto, input);
      const errors = await validate(dto);

      expect(errors.length).toBe(0);
      expect(dto.lat).toBeUndefined();
      expect(dto.lon).toBeUndefined();
    });

    it('should reject invalid string values that cannot be parsed', async () => {
      const input = {
        lat: 'not-a-number',
        lon: 'also-not-a-number',
      };

      const dto = plainToInstance(ExternalEventLocationDto, input);
      const errors = await validate(dto);

      // parseFloat('not-a-number') returns NaN, which fails IsNumber validation
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
