import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AtprotoIdentityController } from './atproto-identity.controller';
import { AtprotoIdentityService } from './atproto-identity.service';
import {
  AtprotoIdentityRecoveryService,
  RecoveryStatus,
} from './atproto-identity-recovery.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';

describe('AtprotoIdentityController', () => {
  let controller: AtprotoIdentityController;
  let identityService: UserAtprotoIdentityService;
  let atprotoIdentityService: AtprotoIdentityService;
  let recoveryService: AtprotoIdentityRecoveryService;
  let userService: UserService;
  let configService: ConfigService;

  const mockIdentityEntity: Partial<UserAtprotoIdentityEntity> = {
    id: 1,
    userUlid: '01234567890123456789012345',
    did: 'did:plc:abc123xyz789',
    handle: 'test-user.opnmt.me',
    pdsUrl: 'https://pds.openmeet.net',
    pdsCredentials: 'encrypted-credentials-should-not-be-exposed',
    isCustodial: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };

  const mockNonCustodialIdentity: Partial<UserAtprotoIdentityEntity> = {
    id: 2,
    userUlid: '01234567890123456789012346',
    did: 'did:plc:external789',
    handle: 'external.bsky.social',
    pdsUrl: 'https://bsky.social',
    pdsCredentials: null,
    isCustodial: false,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };

  // Mock request with only JWT payload fields (id, role, slug, sessionId, tenantId)
  // ulid and email are NOT in JWT, must be fetched from database
  const mockRequest = {
    user: {
      id: 1,
    },
    tenantId: 'test-tenant',
  };

  // Mock user entity returned from database lookup
  const mockUserEntity = {
    id: 1,
    ulid: '01234567890123456789012345',
    slug: 'test-user',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    const mockIdentityService = {
      findByUserUlid: jest.fn(),
    };

    const mockAtprotoIdentityService = {
      createIdentity: jest.fn(),
    };

    const mockRecoveryService = {
      checkRecoveryStatus: jest.fn(),
      recoverAsCustodial: jest.fn(),
      initiateTakeOwnership: jest.fn(),
      completeTakeOwnership: jest.fn(),
    };

    const mockUserServiceImpl = {
      findById: jest.fn().mockResolvedValue(mockUserEntity),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'pds.url') return 'https://pds.openmeet.net';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AtprotoIdentityController],
      providers: [
        {
          provide: UserAtprotoIdentityService,
          useValue: mockIdentityService,
        },
        {
          provide: AtprotoIdentityService,
          useValue: mockAtprotoIdentityService,
        },
        {
          provide: AtprotoIdentityRecoveryService,
          useValue: mockRecoveryService,
        },
        {
          provide: UserService,
          useValue: mockUserServiceImpl,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<AtprotoIdentityController>(
      AtprotoIdentityController,
    );
    identityService = module.get<UserAtprotoIdentityService>(
      UserAtprotoIdentityService,
    );
    atprotoIdentityService = module.get<AtprotoIdentityService>(
      AtprotoIdentityService,
    );
    recoveryService = module.get<AtprotoIdentityRecoveryService>(
      AtprotoIdentityRecoveryService,
    );
    userService = module.get<UserService>(UserService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getIdentity', () => {
    it('should return AT Protocol identity when it exists', async () => {
      // Arrange
      jest
        .spyOn(identityService, 'findByUserUlid')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act
      const result = await controller.getIdentity(mockRequest);

      // Assert - controller fetches user from DB to get ulid
      expect(userService.findById).toHaveBeenCalledWith(1, 'test-tenant');
      expect(identityService.findByUserUlid).toHaveBeenCalledWith(
        'test-tenant',
        '01234567890123456789012345',
      );
      expect(result).toEqual({
        did: 'did:plc:abc123xyz789',
        handle: 'test-user.opnmt.me',
        pdsUrl: 'https://pds.openmeet.net',
        isCustodial: true,
        isOurPds: true,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      jest.spyOn(userService, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(controller.getIdentity(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return null when user has no AT Protocol identity', async () => {
      // Arrange
      jest.spyOn(identityService, 'findByUserUlid').mockResolvedValue(null);

      // Act
      const result = await controller.getIdentity(mockRequest);

      // Assert
      expect(identityService.findByUserUlid).toHaveBeenCalledWith(
        'test-tenant',
        '01234567890123456789012345',
      );
      expect(result).toBeNull();
    });

    it('should NEVER expose pdsCredentials in the response', async () => {
      // Arrange - identity with pdsCredentials
      jest
        .spyOn(identityService, 'findByUserUlid')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act
      const result = await controller.getIdentity(mockRequest);

      // Assert - pdsCredentials should not be present in result
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result).not.toHaveProperty('pdsCredentials');
      // Double check the value wasn't sneaked in under another name
      expect(JSON.stringify(result)).not.toContain('encrypted-credentials');
    });

    it('should correctly identify when identity is on our PDS', async () => {
      // Arrange - custodial identity on our PDS
      jest
        .spyOn(identityService, 'findByUserUlid')
        .mockResolvedValue(mockIdentityEntity as UserAtprotoIdentityEntity);

      // Act
      const result = await controller.getIdentity(mockRequest);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.isOurPds).toBe(true);
    });

    it('should correctly identify when identity is NOT on our PDS', async () => {
      // Arrange - non-custodial identity on external PDS
      // Mock a different user who has an external PDS identity
      const externalUser = {
        id: 2,
        ulid: '01234567890123456789012346',
        slug: 'external-user',
        email: 'external@example.com',
      };
      jest.spyOn(userService, 'findById').mockResolvedValueOnce(externalUser);
      jest
        .spyOn(identityService, 'findByUserUlid')
        .mockResolvedValue(
          mockNonCustodialIdentity as UserAtprotoIdentityEntity,
        );

      // Act
      const result = await controller.getIdentity({
        user: { id: 2 },
        tenantId: 'test-tenant',
      });

      // Assert
      expect(result).not.toBeNull();
      expect(result!.isOurPds).toBe(false);
      expect(result!.pdsUrl).toBe('https://bsky.social');
    });

    it('should handle null handle correctly', async () => {
      // Arrange - identity with null handle
      const identityWithNullHandle = {
        ...mockIdentityEntity,
        handle: null,
      };
      jest
        .spyOn(identityService, 'findByUserUlid')
        .mockResolvedValue(identityWithNullHandle as UserAtprotoIdentityEntity);

      // Act
      const result = await controller.getIdentity(mockRequest);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.handle).toBeNull();
    });
  });

  describe('createIdentity', () => {
    it('should create AT Protocol identity when none exists', async () => {
      // Arrange
      const createdIdentity = {
        ...mockIdentityEntity,
      };
      jest
        .spyOn(atprotoIdentityService, 'createIdentity')
        .mockResolvedValue(createdIdentity as UserAtprotoIdentityEntity);

      // Act
      const result = await controller.createIdentity(mockRequest);

      // Assert - controller fetches user from DB, then calls createIdentity with user data
      expect(userService.findById).toHaveBeenCalledWith(1, 'test-tenant');
      expect(atprotoIdentityService.createIdentity).toHaveBeenCalledWith(
        'test-tenant',
        {
          ulid: mockUserEntity.ulid,
          slug: mockUserEntity.slug,
          email: mockUserEntity.email,
        },
      );
      expect(result).toEqual({
        did: 'did:plc:abc123xyz789',
        handle: 'test-user.opnmt.me',
        pdsUrl: 'https://pds.openmeet.net',
        isCustodial: true,
        isOurPds: true,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      jest.spyOn(userService, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(controller.createIdentity(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when identity already exists', async () => {
      // Arrange
      jest
        .spyOn(atprotoIdentityService, 'createIdentity')
        .mockRejectedValue(
          new ConflictException('AT Protocol identity already exists'),
        );

      // Act & Assert
      await expect(controller.createIdentity(mockRequest)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should NEVER expose pdsCredentials in the create response', async () => {
      // Arrange
      const createdIdentity = {
        ...mockIdentityEntity,
        pdsCredentials: 'super-secret-encrypted-credentials',
      };
      jest
        .spyOn(atprotoIdentityService, 'createIdentity')
        .mockResolvedValue(createdIdentity as UserAtprotoIdentityEntity);

      // Act
      const result = await controller.createIdentity(mockRequest);

      // Assert
      expect(result).not.toHaveProperty('pdsCredentials');
      expect(JSON.stringify(result)).not.toContain('super-secret');
    });
  });

  describe('getRecoveryStatus', () => {
    it('should return recovery status when user exists', async () => {
      // Arrange
      const mockRecoveryStatus: RecoveryStatus = {
        hasExistingAccount: true,
        did: 'did:plc:existing123',
        handle: 'existing-user.opnmt.me',
      };
      jest
        .spyOn(recoveryService, 'checkRecoveryStatus')
        .mockResolvedValue(mockRecoveryStatus);

      // Act
      const result = await controller.getRecoveryStatus(mockRequest);

      // Assert
      expect(userService.findById).toHaveBeenCalledWith(1, 'test-tenant');
      expect(recoveryService.checkRecoveryStatus).toHaveBeenCalledWith(
        'test-tenant',
        '01234567890123456789012345',
      );
      expect(result).toEqual(mockRecoveryStatus);
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      jest.spyOn(userService, 'findById').mockResolvedValueOnce(null);

      // Act & Assert
      await expect(controller.getRecoveryStatus(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return hasExistingAccount: false when no PDS account exists', async () => {
      // Arrange
      const mockRecoveryStatus: RecoveryStatus = {
        hasExistingAccount: false,
      };
      jest
        .spyOn(recoveryService, 'checkRecoveryStatus')
        .mockResolvedValue(mockRecoveryStatus);

      // Act
      const result = await controller.getRecoveryStatus(mockRequest);

      // Assert
      expect(result.hasExistingAccount).toBe(false);
      expect(result.did).toBeUndefined();
      expect(result.handle).toBeUndefined();
    });
  });

  describe('recoverAsCustodial', () => {
    it('should recover existing PDS account as custodial', async () => {
      // Arrange
      const recoveredIdentity = {
        ...mockIdentityEntity,
        did: 'did:plc:recovered123',
        handle: 'recovered-user.opnmt.me',
      };
      jest
        .spyOn(recoveryService, 'recoverAsCustodial')
        .mockResolvedValue(recoveredIdentity as UserAtprotoIdentityEntity);

      // Act
      const result = await controller.recoverAsCustodial(mockRequest);

      // Assert
      expect(userService.findById).toHaveBeenCalledWith(1, 'test-tenant');
      expect(recoveryService.recoverAsCustodial).toHaveBeenCalledWith(
        'test-tenant',
        '01234567890123456789012345',
      );
      expect(result.did).toBe('did:plc:recovered123');
      expect(result.handle).toBe('recovered-user.opnmt.me');
      expect(result).not.toHaveProperty('pdsCredentials');
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      jest.spyOn(userService, 'findById').mockResolvedValueOnce(null);

      // Act & Assert
      await expect(controller.recoverAsCustodial(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when user already has identity', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'recoverAsCustodial')
        .mockRejectedValue(
          new BadRequestException('User already has AT Protocol identity'),
        );

      // Act & Assert
      await expect(controller.recoverAsCustodial(mockRequest)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when no PDS account found', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'recoverAsCustodial')
        .mockRejectedValue(
          new NotFoundException('No PDS account found for this email'),
        );

      // Act & Assert
      await expect(controller.recoverAsCustodial(mockRequest)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('initiateTakeOwnership', () => {
    it('should initiate take ownership and return email', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'initiateTakeOwnership')
        .mockResolvedValue({ email: 'test@example.com' });

      // Act
      const result = await controller.initiateTakeOwnership(mockRequest);

      // Assert
      expect(userService.findById).toHaveBeenCalledWith(1, 'test-tenant');
      expect(recoveryService.initiateTakeOwnership).toHaveBeenCalledWith(
        'test-tenant',
        '01234567890123456789012345',
      );
      expect(result).toEqual({ email: 'test@example.com' });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      jest.spyOn(userService, 'findById').mockResolvedValueOnce(null);

      // Act & Assert
      await expect(
        controller.initiateTakeOwnership(mockRequest),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user has no identity', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'initiateTakeOwnership')
        .mockRejectedValue(
          new BadRequestException(
            'User has no AT Protocol identity to take ownership of',
          ),
        );

      // Act & Assert
      await expect(
        controller.initiateTakeOwnership(mockRequest),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user already owns identity', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'initiateTakeOwnership')
        .mockRejectedValue(
          new BadRequestException(
            'User already owns their AT Protocol identity',
          ),
        );

      // Act & Assert
      await expect(
        controller.initiateTakeOwnership(mockRequest),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeTakeOwnership', () => {
    const mockCompleteRequest = {
      ...mockRequest,
      body: { password: 'user-chosen-password-123' },
    };

    it('should complete take ownership with valid password and return success', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'completeTakeOwnership')
        .mockResolvedValue(undefined);

      // Act
      const result = await controller.completeTakeOwnership(
        mockCompleteRequest,
        { password: 'user-chosen-password-123' },
      );

      // Assert
      expect(userService.findById).toHaveBeenCalledWith(1, 'test-tenant');
      expect(recoveryService.completeTakeOwnership).toHaveBeenCalledWith(
        'test-tenant',
        '01234567890123456789012345',
        'user-chosen-password-123',
      );
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      jest.spyOn(userService, 'findById').mockResolvedValueOnce(null);

      // Act & Assert
      await expect(
        controller.completeTakeOwnership(mockCompleteRequest, {
          password: 'some-password',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user has no identity', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'completeTakeOwnership')
        .mockRejectedValue(
          new BadRequestException('User has no AT Protocol identity'),
        );

      // Act & Assert
      await expect(
        controller.completeTakeOwnership(mockCompleteRequest, {
          password: 'some-password',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when user already owns identity', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'completeTakeOwnership')
        .mockRejectedValue(
          new BadRequestException(
            'User already owns their AT Protocol identity',
          ),
        );

      // Act & Assert
      await expect(
        controller.completeTakeOwnership(mockCompleteRequest, {
          password: 'some-password',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when password verification fails', async () => {
      // Arrange
      jest
        .spyOn(recoveryService, 'completeTakeOwnership')
        .mockRejectedValue(
          new BadRequestException(
            'Invalid password - could not authenticate to PDS',
          ),
        );

      // Act & Assert
      await expect(
        controller.completeTakeOwnership(mockCompleteRequest, {
          password: 'wrong-password',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
