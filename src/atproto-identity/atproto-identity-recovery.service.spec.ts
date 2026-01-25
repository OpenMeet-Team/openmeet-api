import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AtprotoIdentityRecoveryService } from './atproto-identity-recovery.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { PdsAccountService } from '../pds/pds-account.service';
import { PdsCredentialService } from '../pds/pds-credential.service';
import { UserService } from '../user/user.service';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';

describe('AtprotoIdentityRecoveryService', () => {
  let service: AtprotoIdentityRecoveryService;
  let userAtprotoIdentityService: jest.Mocked<UserAtprotoIdentityService>;
  let pdsAccountService: jest.Mocked<PdsAccountService>;
  let pdsCredentialService: jest.Mocked<PdsCredentialService>;
  let userService: jest.Mocked<UserService>;

  const mockUser = {
    id: 1,
    ulid: '01234567890123456789012345',
    slug: 'test-user',
    email: 'test@example.com',
  };

  const mockPdsAccount = {
    did: 'did:plc:abc123xyz789',
    handle: 'test-user.dev.opnmt.me',
    email: 'test@example.com',
  };

  const mockIdentityEntity: Partial<UserAtprotoIdentityEntity> = {
    id: 1,
    userUlid: '01234567890123456789012345',
    did: 'did:plc:abc123xyz789',
    handle: 'test-user.dev.opnmt.me',
    pdsUrl: 'https://pds-dev.openmeet.net',
    pdsCredentials: 'encrypted-credentials',
    isCustodial: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    const mockUserAtprotoIdentityService = {
      findByUserUlid: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const mockPdsAccountService = {
      searchAccountsByEmail: jest.fn(),
      adminUpdateAccountPassword: jest.fn(),
      requestPasswordReset: jest.fn(),
      createSession: jest.fn(),
    };

    const mockPdsCredentialService = {
      encrypt: jest.fn(),
    };

    const mockUserService = {
      findByUlid: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'pds.url') return 'https://pds-dev.openmeet.net';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoIdentityRecoveryService,
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
          provide: UserService,
          useValue: mockUserService,
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

    service = await module.resolve<AtprotoIdentityRecoveryService>(
      AtprotoIdentityRecoveryService,
    );
    userAtprotoIdentityService = module.get(UserAtprotoIdentityService);
    pdsAccountService = module.get(PdsAccountService);
    pdsCredentialService = module.get(PdsCredentialService);
    userService = module.get(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkRecoveryStatus', () => {
    it('should return existing account info when found on PDS', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockResolvedValue(mockPdsAccount);

      // Act
      const result = await service.checkRecoveryStatus(
        'test-tenant',
        mockUser.ulid,
      );

      // Assert
      expect(result).toEqual({
        hasExistingAccount: true,
        did: mockPdsAccount.did,
        handle: mockPdsAccount.handle,
      });
      expect(userService.findByUlid).toHaveBeenCalledWith(
        mockUser.ulid,
        'test-tenant',
      );
      expect(pdsAccountService.searchAccountsByEmail).toHaveBeenCalledWith(
        mockUser.email,
      );
    });

    it('should return false when user has no email', async () => {
      // Arrange
      const userWithoutEmail = { ...mockUser, email: null };
      userService.findByUlid.mockResolvedValue(userWithoutEmail as any);

      // Act
      const result = await service.checkRecoveryStatus(
        'test-tenant',
        mockUser.ulid,
      );

      // Assert
      expect(result).toEqual({ hasExistingAccount: false });
      expect(pdsAccountService.searchAccountsByEmail).not.toHaveBeenCalled();
    });

    it('should return false when user already has identity', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        mockIdentityEntity as UserAtprotoIdentityEntity,
      );

      // Act
      const result = await service.checkRecoveryStatus(
        'test-tenant',
        mockUser.ulid,
      );

      // Assert
      expect(result).toEqual({ hasExistingAccount: false });
      expect(pdsAccountService.searchAccountsByEmail).not.toHaveBeenCalled();
    });

    it('should return false when no PDS account found', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockResolvedValue(null);

      // Act
      const result = await service.checkRecoveryStatus(
        'test-tenant',
        mockUser.ulid,
      );

      // Assert
      expect(result).toEqual({ hasExistingAccount: false });
    });

    it('should return false when user not found', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(null);

      // Act
      const result = await service.checkRecoveryStatus(
        'test-tenant',
        mockUser.ulid,
      );

      // Assert
      expect(result).toEqual({ hasExistingAccount: false });
    });

    it('should return false when PDS admin API is not configured', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockRejectedValue(
        new Error('No service configured for com.atproto.admin.searchAccounts'),
      );

      // Act
      const result = await service.checkRecoveryStatus(
        'test-tenant',
        mockUser.ulid,
      );

      // Assert
      expect(result).toEqual({ hasExistingAccount: false });
    });

    it('should re-throw non "No service configured" errors', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockRejectedValue(
        new Error('Network error'),
      );

      // Act & Assert
      await expect(
        service.checkRecoveryStatus('test-tenant', mockUser.ulid),
      ).rejects.toThrow('Network error');
    });
  });

  describe('recoverAsCustodial', () => {
    it('should create custodial identity with new password', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockResolvedValue(mockPdsAccount);
      pdsAccountService.adminUpdateAccountPassword.mockResolvedValue(undefined);
      pdsCredentialService.encrypt.mockReturnValue('encrypted-new-password');
      userAtprotoIdentityService.create.mockResolvedValue(
        mockIdentityEntity as UserAtprotoIdentityEntity,
      );

      // Act
      const result = await service.recoverAsCustodial(
        'test-tenant',
        mockUser.ulid,
      );

      // Assert
      expect(pdsAccountService.adminUpdateAccountPassword).toHaveBeenCalledWith(
        mockPdsAccount.did,
        expect.any(String),
      );
      expect(pdsCredentialService.encrypt).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(userAtprotoIdentityService.create).toHaveBeenCalledWith(
        'test-tenant',
        {
          userUlid: mockUser.ulid,
          did: mockPdsAccount.did,
          handle: mockPdsAccount.handle,
          pdsUrl: 'https://pds-dev.openmeet.net',
          pdsCredentials: 'encrypted-new-password',
          isCustodial: true,
        },
      );
      expect(result).toEqual(mockIdentityEntity);
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.recoverAsCustodial('test-tenant', mockUser.ulid),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when user already has identity', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        mockIdentityEntity as UserAtprotoIdentityEntity,
      );

      // Act & Assert
      await expect(
        service.recoverAsCustodial('test-tenant', mockUser.ulid),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when no PDS account found', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.recoverAsCustodial('test-tenant', mockUser.ulid),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when PDS admin API is not configured', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockRejectedValue(
        new Error('No service configured for com.atproto.admin.searchAccounts'),
      );

      // Act & Assert
      await expect(
        service.recoverAsCustodial('test-tenant', mockUser.ulid),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recoverAsCustodial('test-tenant', mockUser.ulid),
      ).rejects.toThrow('PDS admin API not available');
    });

    it('should handle race condition when concurrent requests create duplicate identity', async () => {
      // Arrange - Simulate race condition:
      // findByUserUlid returns null (check passes), but create() fails due to
      // another concurrent request having already inserted a record
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockResolvedValue(mockPdsAccount);
      pdsAccountService.adminUpdateAccountPassword.mockResolvedValue(undefined);
      pdsCredentialService.encrypt.mockReturnValue('encrypted-new-password');

      // Simulate PostgreSQL unique constraint violation error
      const duplicateKeyError = new Error(
        'duplicate key value violates unique constraint "UQ_tenant_userAtprotoIdentities_userUlid"',
      );
      (duplicateKeyError as any).code = '23505'; // PostgreSQL unique violation code
      userAtprotoIdentityService.create.mockRejectedValue(duplicateKeyError);

      // Also mock that when we re-fetch, we find the identity created by the concurrent request
      userAtprotoIdentityService.findByUserUlid
        .mockResolvedValueOnce(null) // First call (check) returns null
        .mockResolvedValueOnce(mockIdentityEntity as UserAtprotoIdentityEntity); // Second call (after error) returns the identity

      // Act & Assert - Should throw BadRequestException indicating identity already exists
      await expect(
        service.recoverAsCustodial('test-tenant', mockUser.ulid),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recoverAsCustodial('test-tenant', mockUser.ulid),
      ).rejects.toThrow('User already has AT Protocol identity');
    });

    it('should re-throw non-duplicate-key errors from create', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);
      pdsAccountService.searchAccountsByEmail.mockResolvedValue(mockPdsAccount);
      pdsAccountService.adminUpdateAccountPassword.mockResolvedValue(undefined);
      pdsCredentialService.encrypt.mockReturnValue('encrypted-new-password');

      // Simulate a different database error (not a duplicate key)
      const dbError = new Error('Connection lost');
      userAtprotoIdentityService.create.mockRejectedValue(dbError);

      // Act & Assert - Should re-throw the original error
      await expect(
        service.recoverAsCustodial('test-tenant', mockUser.ulid),
      ).rejects.toThrow('Connection lost');
    });
  });

  describe('initiateTakeOwnership', () => {
    it('should trigger password reset email for custodial identity', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        mockIdentityEntity as UserAtprotoIdentityEntity,
      );
      pdsAccountService.requestPasswordReset.mockResolvedValue(undefined);

      // Act
      const result = await service.initiateTakeOwnership(
        'test-tenant',
        mockUser.ulid,
      );

      // Assert
      expect(pdsAccountService.requestPasswordReset).toHaveBeenCalledWith(
        mockUser.email,
      );
      expect(result).toEqual({ email: mockUser.email });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.initiateTakeOwnership('test-tenant', mockUser.ulid),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when no custodial identity exists', async () => {
      // Arrange
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.initiateTakeOwnership('test-tenant', mockUser.ulid),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when identity is already non-custodial', async () => {
      // Arrange
      const nonCustodialIdentity = {
        ...mockIdentityEntity,
        isCustodial: false,
      };
      userService.findByUlid.mockResolvedValue(mockUser as any);
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        nonCustodialIdentity as UserAtprotoIdentityEntity,
      );

      // Act & Assert
      await expect(
        service.initiateTakeOwnership('test-tenant', mockUser.ulid),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('completeTakeOwnership', () => {
    const mockNewPassword = 'user-chosen-password-123';
    const mockSessionResponse = {
      did: mockIdentityEntity.did,
      handle: mockIdentityEntity.handle,
      accessJwt: 'access-token',
      refreshJwt: 'refresh-token',
    };

    it('should verify password by creating session, then clear credentials and set non-custodial', async () => {
      // Arrange
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        mockIdentityEntity as UserAtprotoIdentityEntity,
      );
      pdsAccountService.createSession.mockResolvedValue(mockSessionResponse);
      userAtprotoIdentityService.update.mockResolvedValue({
        ...mockIdentityEntity,
        pdsCredentials: null,
        isCustodial: false,
      } as UserAtprotoIdentityEntity);

      // Act
      await service.completeTakeOwnership(
        'test-tenant',
        mockUser.ulid,
        mockNewPassword,
      );

      // Assert - verify password by creating session first
      expect(pdsAccountService.createSession).toHaveBeenCalledWith(
        mockIdentityEntity.did,
        mockNewPassword,
      );
      expect(userAtprotoIdentityService.update).toHaveBeenCalledWith(
        'test-tenant',
        mockIdentityEntity.id,
        {
          pdsCredentials: null,
          isCustodial: false,
        },
      );
    });

    it('should throw BadRequestException when password verification fails', async () => {
      // Arrange
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        mockIdentityEntity as UserAtprotoIdentityEntity,
      );
      pdsAccountService.createSession.mockRejectedValue(
        new Error('AuthenticationRequired'),
      );

      // Act & Assert
      await expect(
        service.completeTakeOwnership(
          'test-tenant',
          mockUser.ulid,
          'wrong-password',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.completeTakeOwnership(
          'test-tenant',
          mockUser.ulid,
          'wrong-password',
        ),
      ).rejects.toThrow('Invalid password');

      // Credentials should NOT be cleared
      expect(userAtprotoIdentityService.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when no identity exists', async () => {
      // Arrange
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.completeTakeOwnership(
          'test-tenant',
          mockUser.ulid,
          mockNewPassword,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when identity is already non-custodial', async () => {
      // Arrange
      const nonCustodialIdentity = {
        ...mockIdentityEntity,
        isCustodial: false,
      };
      userAtprotoIdentityService.findByUserUlid.mockResolvedValue(
        nonCustodialIdentity as UserAtprotoIdentityEntity,
      );

      // Act & Assert
      await expect(
        service.completeTakeOwnership(
          'test-tenant',
          mockUser.ulid,
          mockNewPassword,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
