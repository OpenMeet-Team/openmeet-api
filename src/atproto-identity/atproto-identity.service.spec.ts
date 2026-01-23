import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AtprotoIdentityService } from './atproto-identity.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { PdsAccountService } from '../pds/pds-account.service';
import { PdsCredentialService } from '../pds/pds-credential.service';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import { PdsApiError } from '../pds/pds.errors';

describe('AtprotoIdentityService', () => {
  let service: AtprotoIdentityService;
  let userAtprotoIdentityService: UserAtprotoIdentityService;
  let pdsAccountService: PdsAccountService;
  let pdsCredentialService: PdsCredentialService;
  let configService: ConfigService;

  const mockUser = {
    ulid: '01234567890123456789012345',
    slug: 'test-user',
    email: 'test@example.com',
  };

  const mockIdentityEntity: Partial<UserAtprotoIdentityEntity> = {
    id: 1,
    userUlid: '01234567890123456789012345',
    did: 'did:plc:abc123xyz789',
    handle: 'test-user.opnmt.me',
    pdsUrl: 'https://pds.openmeet.net',
    pdsCredentials: 'encrypted-credentials',
    isCustodial: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    const mockUserAtprotoIdentityService = {
      findByUserUlid: jest.fn(),
      create: jest.fn(),
    };

    const mockPdsAccountService = {
      createAccount: jest.fn(),
      isHandleAvailable: jest.fn(),
    };

    const mockPdsCredentialService = {
      encrypt: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'pds.url') return 'https://pds.openmeet.net';
        if (key === 'pds.serviceHandleDomains') return '.opnmt.me';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoIdentityService,
        {
          provide: UserAtprotoIdentityService,
          useValue: mockUserAtprotoIdentityService,
        },
        {
          provide: PdsAccountService,
          useValue: mockPdsAccountService,
        },
        {
          provide: PdsCredentialService,
          useValue: mockPdsCredentialService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant' },
        },
      ],
    }).compile();

    service = await module.resolve<AtprotoIdentityService>(
      AtprotoIdentityService,
    );
    userAtprotoIdentityService = module.get<UserAtprotoIdentityService>(
      UserAtprotoIdentityService,
    );
    pdsAccountService = module.get<PdsAccountService>(PdsAccountService);
    pdsCredentialService =
      module.get<PdsCredentialService>(PdsCredentialService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createIdentity', () => {
    it('should create identity when none exists', async () => {
      // Arrange
      jest
        .spyOn(userAtprotoIdentityService, 'findByUserUlid')
        .mockResolvedValue(null);
      jest
        .spyOn(pdsAccountService, 'isHandleAvailable')
        .mockResolvedValue(true);
      jest.spyOn(pdsAccountService, 'createAccount').mockResolvedValue({
        did: 'did:plc:abc123xyz789',
        handle: 'test-user.opnmt.me',
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      });
      jest
        .spyOn(pdsCredentialService, 'encrypt')
        .mockReturnValue('encrypted-password');
      jest
        .spyOn(userAtprotoIdentityService, 'create')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act
      const result = await service.createIdentity('test-tenant', mockUser);

      // Assert
      expect(userAtprotoIdentityService.findByUserUlid).toHaveBeenCalledWith(
        'test-tenant',
        mockUser.ulid,
      );
      expect(pdsAccountService.isHandleAvailable).toHaveBeenCalledWith(
        'test-user.opnmt.me',
      );
      expect(pdsAccountService.createAccount).toHaveBeenCalledWith({
        email: 'test@example.com',
        handle: 'test-user.opnmt.me',
        password: expect.any(String),
      });
      expect(pdsCredentialService.encrypt).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(userAtprotoIdentityService.create).toHaveBeenCalledWith(
        'test-tenant',
        {
          userUlid: mockUser.ulid,
          did: 'did:plc:abc123xyz789',
          handle: 'test-user.opnmt.me',
          pdsUrl: 'https://pds.openmeet.net',
          pdsCredentials: 'encrypted-password',
          isCustodial: true,
        },
      );
      expect(result).toEqual(mockIdentityEntity);
    });

    it('should throw ConflictException when identity already exists', async () => {
      // Arrange
      jest
        .spyOn(userAtprotoIdentityService, 'findByUserUlid')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act & Assert
      await expect(
        service.createIdentity('test-tenant', mockUser),
      ).rejects.toThrow(ConflictException);
      expect(pdsAccountService.createAccount).not.toHaveBeenCalled();
    });

    it('should retry with different handle when handle is taken', async () => {
      // Arrange
      jest
        .spyOn(userAtprotoIdentityService, 'findByUserUlid')
        .mockResolvedValue(null);

      // First handle is taken, second is available
      jest
        .spyOn(pdsAccountService, 'isHandleAvailable')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      jest.spyOn(pdsAccountService, 'createAccount').mockResolvedValue({
        did: 'did:plc:abc123xyz789',
        handle: 'test-user1.opnmt.me',
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      });
      jest
        .spyOn(pdsCredentialService, 'encrypt')
        .mockReturnValue('encrypted-password');
      jest
        .spyOn(userAtprotoIdentityService, 'create')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act
      const result = await service.createIdentity('test-tenant', mockUser);

      // Assert
      expect(pdsAccountService.isHandleAvailable).toHaveBeenCalledTimes(2);
      expect(pdsAccountService.isHandleAvailable).toHaveBeenNthCalledWith(
        1,
        'test-user.opnmt.me',
      );
      expect(pdsAccountService.isHandleAvailable).toHaveBeenNthCalledWith(
        2,
        'test-user1.opnmt.me',
      );
      expect(result).toBeDefined();
    });

    it('should handle race condition when handle becomes taken between check and create', async () => {
      // Arrange
      jest
        .spyOn(userAtprotoIdentityService, 'findByUserUlid')
        .mockResolvedValue(null);

      // Both handles appear available
      jest
        .spyOn(pdsAccountService, 'isHandleAvailable')
        .mockResolvedValue(true);

      // First create fails with handle taken, second succeeds
      jest
        .spyOn(pdsAccountService, 'createAccount')
        .mockRejectedValueOnce(
          new PdsApiError('Handle is taken', 400, 'HandleNotAvailable'),
        )
        .mockResolvedValueOnce({
          did: 'did:plc:abc123xyz789',
          handle: 'test-user1.opnmt.me',
          accessJwt: 'access-jwt',
          refreshJwt: 'refresh-jwt',
        });

      jest
        .spyOn(pdsCredentialService, 'encrypt')
        .mockReturnValue('encrypted-password');
      jest
        .spyOn(userAtprotoIdentityService, 'create')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act
      const result = await service.createIdentity('test-tenant', mockUser);

      // Assert
      expect(pdsAccountService.createAccount).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it('should use fallback email when user has no email', async () => {
      // Arrange
      const userWithoutEmail = { ...mockUser, email: null };

      jest
        .spyOn(userAtprotoIdentityService, 'findByUserUlid')
        .mockResolvedValue(null);
      jest
        .spyOn(pdsAccountService, 'isHandleAvailable')
        .mockResolvedValue(true);
      jest.spyOn(pdsAccountService, 'createAccount').mockResolvedValue({
        did: 'did:plc:abc123xyz789',
        handle: 'test-user.opnmt.me',
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      });
      jest
        .spyOn(pdsCredentialService, 'encrypt')
        .mockReturnValue('encrypted-password');
      jest
        .spyOn(userAtprotoIdentityService, 'create')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act
      await service.createIdentity('test-tenant', userWithoutEmail);

      // Assert
      expect(pdsAccountService.createAccount).toHaveBeenCalledWith({
        email: `${userWithoutEmail.ulid}@openmeet.net`,
        handle: 'test-user.opnmt.me',
        password: expect.any(String),
      });
    });

    it('should truncate long slugs for handle generation', async () => {
      // Arrange
      const userWithLongSlug = {
        ...mockUser,
        slug: 'this-is-a-very-long-slug-that-exceeds-limits',
      };

      jest
        .spyOn(userAtprotoIdentityService, 'findByUserUlid')
        .mockResolvedValue(null);
      jest
        .spyOn(pdsAccountService, 'isHandleAvailable')
        .mockResolvedValue(true);
      jest.spyOn(pdsAccountService, 'createAccount').mockResolvedValue({
        did: 'did:plc:abc123xyz789',
        handle: 'this-is-a-very-.opnmt.me',
        accessJwt: 'access-jwt',
        refreshJwt: 'refresh-jwt',
      });
      jest
        .spyOn(pdsCredentialService, 'encrypt')
        .mockReturnValue('encrypted-password');
      jest
        .spyOn(userAtprotoIdentityService, 'create')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act
      await service.createIdentity('test-tenant', userWithLongSlug);

      // Assert - should be truncated to 16 chars (18 - 2 for collision reserve)
      expect(pdsAccountService.isHandleAvailable).toHaveBeenCalledWith(
        expect.stringMatching(/^this-is-a-very-l.*\.opnmt\.me$/),
      );
    });

    it('should throw error when PDS_URL is not configured', async () => {
      // Arrange
      jest
        .spyOn(userAtprotoIdentityService, 'findByUserUlid')
        .mockResolvedValue(null);
      jest.spyOn(configService, 'get').mockReturnValue(null);

      // Act & Assert
      await expect(
        service.createIdentity('test-tenant', mockUser),
      ).rejects.toThrow('PDS_URL is not configured');
    });
  });
});
