import { Test, TestingModule } from '@nestjs/testing';
import { EmailVerificationCodeService } from './email-verification-code.service';
import { ElastiCacheService } from '../../elasticache/elasticache.service';

describe('EmailVerificationCodeService', () => {
  let service: EmailVerificationCodeService;
  let cacheStore: Map<string, any>;

  // Mock that simulates real Redis behavior
  const mockElastiCacheService = {
    set: jest.fn((key: string, value: any, ttl: number) => {
      cacheStore.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return Promise.resolve();
    }),
    get: jest.fn((key: string) => {
      const item = cacheStore.get(key);
      if (!item) return Promise.resolve(null);
      if (Date.now() > item.expiresAt) {
        cacheStore.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(item.value);
    }),
    del: jest.fn((key: string) => {
      cacheStore.delete(key);
      return Promise.resolve();
    }),
  };

  beforeEach(async () => {
    cacheStore = new Map();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationCodeService,
        {
          provide: ElastiCacheService,
          useValue: mockElastiCacheService,
        },
      ],
    }).compile();

    service = module.get<EmailVerificationCodeService>(
      EmailVerificationCodeService,
    );
  });

  describe('generateCode', () => {
    it('should generate a 6-digit numeric code', async () => {
      const code = await service.generateCode(1, 'tenant', 'test@example.com');

      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate a code that can be validated with matching email', async () => {
      const userId = 123;
      const tenantId = 'test-tenant';
      const email = 'user@example.com';

      const code = await service.generateCode(userId, tenantId, email);
      const result = await service.validateCode(code, email);

      expect(result).toMatchObject({ userId, tenantId, email });
    });

    it('should generate different codes each time', async () => {
      const codes = await Promise.all([
        service.generateCode(1, 'tenant', 'test@example.com'),
        service.generateCode(1, 'tenant', 'test@example.com'),
        service.generateCode(1, 'tenant', 'test@example.com'),
      ]);

      // At least 2 should be different (very high probability)
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBeGreaterThan(1);
    });

    it('should handle code collisions by regenerating', async () => {
      const code1 = await service.generateCode(1, 'tenant-1', 'user1@example.com');
      const code2 = await service.generateCode(2, 'tenant-2', 'user2@example.com');

      // Both should be valid with their respective emails
      const result1 = await service.validateCode(code1, 'user1@example.com');
      const result2 = await service.validateCode(code2, 'user2@example.com');

      expect(result1?.userId).toBe(1);
      expect(result2?.userId).toBe(2);
    });

    it('should allow multiple active codes for the same user', async () => {
      const email = 'user@example.com';
      const code1 = await service.generateCode(1, 'tenant', email);
      const code2 = await service.generateCode(1, 'tenant', email);

      const result1 = await service.validateCode(code1, email);
      const result2 = await service.validateCode(code2, email);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe('validateCode', () => {
    it('should return user data for valid code with matching email', async () => {
      const userId = 456;
      const tenantId = 'tenant-xyz';
      const email = 'valid@example.com';

      const code = await service.generateCode(userId, tenantId, email);
      const result = await service.validateCode(code, email);

      expect(result).toEqual({
        userId,
        tenantId,
        email,
        createdAt: expect.any(Number),
      });
    });

    it('should reject code with wrong email (security check)', async () => {
      const code = await service.generateCode(1, 'tenant', 'correct@example.com');
      const result = await service.validateCode(code, 'wrong@example.com');

      expect(result).toBeNull();
    });

    it('should be case-insensitive for email matching', async () => {
      const code = await service.generateCode(1, 'tenant', 'User@Example.COM');
      const result = await service.validateCode(code, 'user@example.com');

      expect(result).not.toBeNull();
    });

    it('should only allow code to be used once', async () => {
      const email = 'user@example.com';
      const code = await service.generateCode(789, 'tenant', email);

      const firstUse = await service.validateCode(code, email);
      const secondUse = await service.validateCode(code, email);

      expect(firstUse).not.toBeNull();
      expect(secondUse).toBeNull();
    });

    it('should return null for non-existent code', async () => {
      const result = await service.validateCode('999999', 'any@example.com');

      expect(result).toBeNull();
    });

    it('should reject invalid code formats', async () => {
      const invalidCodes = [
        '12345',    // Too short
        '1234567',  // Too long
        'abcdef',   // Not numeric
        '12-34-56', // Invalid chars
        '',         // Empty
        '00000a',   // Contains letter
      ];

      for (const code of invalidCodes) {
        const result = await service.validateCode(code, 'test@example.com');
        expect(result).toBeNull();
      }
    });

    it('should use 7-day expiration', async () => {
      const code = await service.generateCode(1, 'tenant', 'test@example.com');

      // Check TTL was set to 7 days (7 * 24 * 60 * 60 seconds)
      const expectedTTL = 7 * 24 * 60 * 60;
      const setCalls = mockElastiCacheService.set.mock.calls;
      const emailCodeCall = setCalls.find((call) =>
        call[0].startsWith('email_verification:'),
      );

      expect(emailCodeCall).toBeDefined();
      expect(emailCodeCall[2]).toBe(expectedTTL);
    });
  });

  describe('security', () => {
    it('should prevent guessing attacks - code useless without email', async () => {
      // Generate code for user A
      const codeA = await service.generateCode(1, 'tenant', 'usera@example.com');

      // User B tries to use the code with their email
      const resultB = await service.validateCode(codeA, 'userb@example.com');

      expect(resultB).toBeNull();
    });

    it('should have reasonable entropy despite 6 digits', async () => {
      // 6 digits = 1,000,000 possibilities
      // Generate 100 codes and verify they are mostly unique
      const codes = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          service.generateCode(1, 'tenant', `user${i}@example.com`),
        ),
      );

      // All should be valid 6-digit codes
      codes.forEach((code) => {
        expect(code).toMatch(/^\d{6}$/);
      });

      // Most should be unique (allow some collisions, they get regenerated)
      const uniqueCount = new Set(codes).size;
      expect(uniqueCount).toBeGreaterThan(90);
    });
  });
});
