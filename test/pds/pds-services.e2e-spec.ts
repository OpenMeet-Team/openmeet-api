import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import {
  TESTING_PDS_URL,
  TESTING_PDS_HANDLE_DOMAIN,
  TESTING_PDS_ADMIN_PASSWORD,
} from '../utils/constants';
import { PdsCredentialService } from '../../src/pds/pds-credential.service';
import { PdsAccountService } from '../../src/pds/pds-account.service';
import pdsConfig from '../../src/pds/config/pds.config';

jest.setTimeout(60000);

// Generate a short unique suffix for handles
const shortId = () => Math.random().toString(36).substring(2, 8);

// Generate a valid test encryption key (32 bytes base64 encoded)
const TEST_CREDENTIAL_KEY = Buffer.from('a'.repeat(32)).toString('base64');

describe('PDS Services E2E', () => {
  let credentialService: PdsCredentialService;
  let accountService: PdsAccountService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [pdsConfig],
          // Override with test values
          envFilePath: [],
        }),
        HttpModule,
      ],
      providers: [PdsCredentialService, PdsAccountService],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          switch (key) {
            case 'pds.url':
              return TESTING_PDS_URL;
            case 'pds.adminPassword':
              return TESTING_PDS_ADMIN_PASSWORD;
            case 'pds.serviceHandleDomains':
              return TESTING_PDS_HANDLE_DOMAIN;
            case 'pds.credentialKey1':
              return TEST_CREDENTIAL_KEY;
            case 'pds.credentialKey2':
              return undefined;
            default:
              return undefined;
          }
        },
        getOrThrow: (key: string) => {
          const value = module
            .get<ConfigService>(ConfigService)
            .get(key);
          if (value === undefined) {
            throw new Error(`Config ${key} not found`);
          }
          return value;
        },
      })
      .compile();

    credentialService = module.get<PdsCredentialService>(PdsCredentialService);
    accountService = module.get<PdsAccountService>(PdsAccountService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('PdsCredentialService', () => {
    describe('encrypt/decrypt roundtrip', () => {
      it('should encrypt and decrypt a password correctly', () => {
        const originalPassword = 'my-secret-password-123!@#';

        const encrypted = credentialService.encrypt(originalPassword);
        const decrypted = credentialService.decrypt(encrypted);

        expect(decrypted).toBe(originalPassword);
      });

      it('should produce valid JSON structure', () => {
        const encrypted = credentialService.encrypt('test-password');
        const parsed = JSON.parse(encrypted);

        expect(parsed).toHaveProperty('v', 1);
        expect(parsed).toHaveProperty('iv');
        expect(parsed).toHaveProperty('ciphertext');
        expect(parsed).toHaveProperty('authTag');

        // Verify base64 encoding
        expect(Buffer.from(parsed.iv, 'base64').length).toBe(12);
        expect(Buffer.from(parsed.authTag, 'base64').length).toBe(16);
      });

      it('should produce different ciphertext for same password (random IV)', () => {
        const password = 'same-password';

        const encrypted1 = credentialService.encrypt(password);
        const encrypted2 = credentialService.encrypt(password);

        expect(encrypted1).not.toBe(encrypted2);

        // But both should decrypt to the same value
        expect(credentialService.decrypt(encrypted1)).toBe(password);
        expect(credentialService.decrypt(encrypted2)).toBe(password);
      });

      it('should handle unicode and special characters', () => {
        const passwords = [
          'simple',
          'with-special-chars!@#$%^&*()',
          'unicode-emoji',
          'multi\nline\npassword',
          '   leading-trailing-spaces   ',
        ];

        for (const password of passwords) {
          const encrypted = credentialService.encrypt(password);
          const decrypted = credentialService.decrypt(encrypted);
          expect(decrypted).toBe(password);
        }
      });
    });
  });

  describe('PdsAccountService', () => {
    // Note: These tests require a running PDS instance
    // Skip if PDS is not available

    describe('isHandleAvailable()', () => {
      it('should return true for available handle', async () => {
        const uniqueHandle = `avail${shortId()}${TESTING_PDS_HANDLE_DOMAIN}`;

        const isAvailable = await accountService.isHandleAvailable(uniqueHandle);

        expect(isAvailable).toBe(true);
      });

      it('should return false for taken handle', async () => {
        // First create an account
        const email = `taken-${shortId()}@test.invalid`;
        const handle = `taken${shortId()}${TESTING_PDS_HANDLE_DOMAIN}`;
        const password = 'test-password-123';

        await accountService.createAccount({ email, handle, password });

        // Now check if handle is available
        const isAvailable = await accountService.isHandleAvailable(handle);

        expect(isAvailable).toBe(false);
      });
    });

    describe('createAccount()', () => {
      it('should create an account and return DID and tokens', async () => {
        const email = `create-${shortId()}@test.invalid`;
        const handle = `create${shortId()}${TESTING_PDS_HANDLE_DOMAIN}`;
        const password = 'test-password-123';

        const result = await accountService.createAccount({
          email,
          handle,
          password,
        });

        expect(result).toHaveProperty('did');
        expect(result).toHaveProperty('handle', handle);
        expect(result).toHaveProperty('accessJwt');
        expect(result).toHaveProperty('refreshJwt');

        // DID should be valid did:plc format
        expect(result.did).toMatch(/^did:plc:[a-z0-9]+$/);
      });
    });

    describe('createSession()', () => {
      it('should create a session with valid credentials', async () => {
        // First create an account
        const email = `session-${shortId()}@test.invalid`;
        const handle = `sess${shortId()}${TESTING_PDS_HANDLE_DOMAIN}`;
        const password = 'session-test-password-123';

        const account = await accountService.createAccount({
          email,
          handle,
          password,
        });

        // Now create a session (login)
        const session = await accountService.createSession(handle, password);

        expect(session).toHaveProperty('did', account.did);
        expect(session).toHaveProperty('handle', handle);
        expect(session).toHaveProperty('accessJwt');
        expect(session).toHaveProperty('refreshJwt');
      });

      it('should also work with DID as identifier', async () => {
        // First create an account
        const email = `sessid-${shortId()}@test.invalid`;
        const handle = `sessid${shortId()}${TESTING_PDS_HANDLE_DOMAIN}`;
        const password = 'session-did-test-123';

        const account = await accountService.createAccount({
          email,
          handle,
          password,
        });

        // Login with DID instead of handle
        const session = await accountService.createSession(
          account.did,
          password,
        );

        expect(session.did).toBe(account.did);
        expect(session.handle).toBe(handle);
      });
    });
  });

  describe('Integration: Credential encryption with account creation', () => {
    it('should encrypt password for storage and later use for session', async () => {
      // Simulate the full flow: create account, encrypt password, later decrypt and login
      const email = `integ-${shortId()}@test.invalid`;
      const handle = `integ${shortId()}${TESTING_PDS_HANDLE_DOMAIN}`;
      const password = 'integration-test-password-123';

      // 1. Create account on PDS
      const account = await accountService.createAccount({
        email,
        handle,
        password,
      });
      expect(account.did).toBeDefined();

      // 2. Encrypt password for storage (as would be done in UserAtprotoIdentityService)
      const encryptedCredentials = credentialService.encrypt(password);

      // Verify it's valid JSON with expected structure
      const parsed = JSON.parse(encryptedCredentials);
      expect(parsed.v).toBe(1);

      // 3. Later, decrypt and use for session creation
      const decryptedPassword = credentialService.decrypt(encryptedCredentials);
      expect(decryptedPassword).toBe(password);

      // 4. Use decrypted password to create session
      const session = await accountService.createSession(handle, decryptedPassword);
      expect(session.did).toBe(account.did);
    });
  });
});
