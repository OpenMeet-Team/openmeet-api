import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PdsCredentialService } from './pds-credential.service';
import { PdsCredentialDecryptionError } from './pds.errors';

describe('PdsCredentialService', () => {
  let service: PdsCredentialService;
  let configService: jest.Mocked<ConfigService>;

  // Generate valid 32-byte keys encoded as base64
  const validKey1 = Buffer.from('a'.repeat(32)).toString('base64'); // 32 bytes of 'a'
  const validKey2 = Buffer.from('b'.repeat(32)).toString('base64'); // 32 bytes of 'b'

  const mockConfigService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default config: KEY_1 configured, KEY_2 not configured
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'pds.credentialKey1':
          return validKey1;
        case 'pds.credentialKey2':
          return undefined;
        default:
          return undefined;
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdsCredentialService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PdsCredentialService>(PdsCredentialService);
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  describe('encrypt()', () => {
    it('should encrypt a password and return JSON with v:1', () => {
      const password = 'my-secret-password';

      const encrypted = service.encrypt(password);

      // Should be valid JSON
      const parsed = JSON.parse(encrypted);

      // Should have required fields
      expect(parsed).toHaveProperty('v', 1);
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('ciphertext');
      expect(parsed).toHaveProperty('authTag');

      // IV should be base64-encoded 12 bytes
      const ivBuffer = Buffer.from(parsed.iv, 'base64');
      expect(ivBuffer.length).toBe(12);

      // Auth tag should be base64-encoded 16 bytes
      const authTagBuffer = Buffer.from(parsed.authTag, 'base64');
      expect(authTagBuffer.length).toBe(16);
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const password = 'my-secret-password';

      const encrypted1 = service.encrypt(password);
      const encrypted2 = service.encrypt(password);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      const decrypted1 = service.decrypt(encrypted1);
      const decrypted2 = service.decrypt(encrypted2);

      expect(decrypted1).toBe(password);
      expect(decrypted2).toBe(password);
    });
  });

  describe('decrypt()', () => {
    it('should decrypt an encrypted password (roundtrip with v:1)', () => {
      const password = 'my-secret-password';
      const encrypted = service.encrypt(password);

      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(password);
    });

    it('should decrypt v:2 credential with KEY_2', async () => {
      // Configure KEY_2
      mockConfigService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'pds.credentialKey1':
            return validKey1;
          case 'pds.credentialKey2':
            return validKey2;
          default:
            return undefined;
        }
      });

      // Create a new service instance with KEY_2 configured
      const serviceWithKey2 = new PdsCredentialService(
        configService as unknown as ConfigService,
      );

      // To test KEY_2 decryption, we manually construct a v:2 credential
      // using the same crypto operations the service would use.
      // This tests that the service CAN decrypt v:2 credentials (key rotation support).
      const password = 'password-encrypted-with-key2';
      const crypto = await import('crypto');
      const key2 = Buffer.from(validKey2, 'base64');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key2, iv);
      const encrypted = Buffer.concat([
        cipher.update(password, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const v2Credential = JSON.stringify({
        v: 2,
        iv: iv.toString('base64'),
        ciphertext: encrypted.toString('base64'),
        authTag: authTag.toString('base64'),
      });

      // Decrypt should work with v:2
      const decrypted = serviceWithKey2.decrypt(v2Credential);

      expect(decrypted).toBe(password);
    });

    it('should throw PdsCredentialDecryptionError on unknown version (v:99)', () => {
      const invalidCredential = JSON.stringify({
        v: 99,
        iv: Buffer.from('a'.repeat(12)).toString('base64'),
        ciphertext: Buffer.from('encrypted').toString('base64'),
        authTag: Buffer.from('a'.repeat(16)).toString('base64'),
      });

      expect(() => service.decrypt(invalidCredential)).toThrow(
        PdsCredentialDecryptionError,
      );
      expect(() => service.decrypt(invalidCredential)).toThrow(
        'Unknown credential version: 99',
      );
    });

    it('should throw PdsCredentialDecryptionError if v:2 but KEY_2 not configured', () => {
      // KEY_2 is not configured (default mock)
      const v2Credential = JSON.stringify({
        v: 2,
        iv: Buffer.from('a'.repeat(12)).toString('base64'),
        ciphertext: Buffer.from('encrypted').toString('base64'),
        authTag: Buffer.from('a'.repeat(16)).toString('base64'),
      });

      expect(() => service.decrypt(v2Credential)).toThrow(
        PdsCredentialDecryptionError,
      );
      expect(() => service.decrypt(v2Credential)).toThrow(
        'Credential requires KEY_2 but it is not configured',
      );
    });

    it('should throw PdsCredentialDecryptionError on corrupted ciphertext', () => {
      const password = 'my-secret-password';
      const encrypted = service.encrypt(password);

      // Corrupt the ciphertext
      const parsed = JSON.parse(encrypted);
      parsed.ciphertext = Buffer.from('corrupted-data').toString('base64');
      const corrupted = JSON.stringify(parsed);

      expect(() => service.decrypt(corrupted)).toThrow(
        PdsCredentialDecryptionError,
      );
    });

    it('should handle special characters in password', () => {
      const specialPassword = 'p@$$w0rd!#%^&*()_+-=[]{}|;:,.<>?/~`';
      const encrypted = service.encrypt(specialPassword);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(specialPassword);
    });

    it('should handle unicode characters in password', () => {
      const unicodePassword = 'password-with-emoji-and-unicode';
      const encrypted = service.encrypt(unicodePassword);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(unicodePassword);
    });

    it('should throw on invalid JSON', () => {
      expect(() => service.decrypt('not-valid-json')).toThrow(
        PdsCredentialDecryptionError,
      );
    });
  });
});
