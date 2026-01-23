import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AtprotoIdentityController } from './atproto-identity.controller';
import { AtprotoIdentityService } from './atproto-identity.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';

describe('AtprotoIdentityController', () => {
  let controller: AtprotoIdentityController;
  let identityService: UserAtprotoIdentityService;
  let atprotoIdentityService: AtprotoIdentityService;
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
});
