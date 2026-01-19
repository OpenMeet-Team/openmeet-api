import { Test, TestingModule } from '@nestjs/testing';
import { UserAtprotoIdentityService } from './user-atproto-identity.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { Repository } from 'typeorm';
import { UserAtprotoIdentityEntity } from './infrastructure/persistence/relational/entities/user-atproto-identity.entity';

describe('UserAtprotoIdentityService', () => {
  let service: UserAtprotoIdentityService;
  let repository: jest.Mocked<Repository<UserAtprotoIdentityEntity>>;
  let tenantService: jest.Mocked<TenantConnectionService>;

  const mockIdentity: Partial<UserAtprotoIdentityEntity> = {
    id: 1,
    userUlid: '01hqvxz6j8k9m0n1p2q3r4s5t6',
    did: 'did:plc:abc123xyz',
    handle: 'alice.dev.opnmt.me',
    pdsUrl: 'https://pds-dev.openmeet.net',
    pdsCredentials: { password: 'encrypted-password-here' },
    isCustodial: true,
    createdAt: new Date('2025-01-19T14:00:00Z'),
    updatedAt: new Date('2025-01-19T14:00:00Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const mockTenantService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockRepository),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAtprotoIdentityService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantService,
        },
      ],
    }).compile();

    // Use resolve() for REQUEST-scoped providers
    service = await module.resolve<UserAtprotoIdentityService>(
      UserAtprotoIdentityService,
    );
    tenantService = module.get(
      TenantConnectionService,
    ) as jest.Mocked<TenantConnectionService>;

    // Get the repository after tenant connection is established
    const connection =
      await tenantService.getTenantConnection(TESTING_TENANT_ID);
    repository = connection.getRepository(
      UserAtprotoIdentityEntity,
    ) as jest.Mocked<Repository<UserAtprotoIdentityEntity>>;
  });

  describe('findByUserUlid()', () => {
    it('should return identity when found by userUlid', async () => {
      repository.findOne.mockResolvedValue(
        mockIdentity as UserAtprotoIdentityEntity,
      );

      const result = await service.findByUserUlid(
        TESTING_TENANT_ID,
        '01hqvxz6j8k9m0n1p2q3r4s5t6',
      );

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { userUlid: '01hqvxz6j8k9m0n1p2q3r4s5t6' },
      });
      expect(result).toEqual(mockIdentity);
    });

    it('should return null when identity not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findByUserUlid(
        TESTING_TENANT_ID,
        'nonexistent-ulid',
      );

      expect(result).toBeNull();
    });
  });

  describe('findByDid()', () => {
    it('should return identity when found by DID', async () => {
      repository.findOne.mockResolvedValue(
        mockIdentity as UserAtprotoIdentityEntity,
      );

      const result = await service.findByDid(
        TESTING_TENANT_ID,
        'did:plc:abc123xyz',
      );

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { did: 'did:plc:abc123xyz' },
      });
      expect(result).toEqual(mockIdentity);
    });

    it('should return null when DID not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findByDid(
        TESTING_TENANT_ID,
        'did:plc:nonexistent',
      );

      expect(result).toBeNull();
    });
  });

  describe('create()', () => {
    it('should create a new custodial AT Protocol identity', async () => {
      const createData = {
        userUlid: '01hqvxz6j8k9m0n1p2q3r4s5t6',
        did: 'did:plc:abc123xyz',
        handle: 'alice.dev.opnmt.me',
        pdsUrl: 'https://pds-dev.openmeet.net',
        pdsCredentials: { password: 'encrypted-password' },
        isCustodial: true,
      };

      repository.create.mockReturnValue(
        mockIdentity as UserAtprotoIdentityEntity,
      );
      repository.save.mockResolvedValue(
        mockIdentity as UserAtprotoIdentityEntity,
      );

      const result = await service.create(TESTING_TENANT_ID, createData);

      expect(repository.create).toHaveBeenCalledWith(createData);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockIdentity);
    });

    it('should create a non-custodial identity without credentials', async () => {
      const createData = {
        userUlid: '01hqvxz6j8k9m0n1p2q3r4s5t6',
        did: 'did:plc:external123',
        handle: 'alice.bsky.social',
        pdsUrl: 'https://bsky.social',
        isCustodial: false,
      };

      const nonCustodialIdentity = {
        ...mockIdentity,
        ...createData,
        pdsCredentials: null,
      };

      repository.create.mockReturnValue(
        nonCustodialIdentity as UserAtprotoIdentityEntity,
      );
      repository.save.mockResolvedValue(
        nonCustodialIdentity as UserAtprotoIdentityEntity,
      );

      const result = await service.create(TESTING_TENANT_ID, createData);

      expect(result.isCustodial).toBe(false);
      expect(result.pdsCredentials).toBeNull();
    });
  });

  describe('update()', () => {
    it('should update an existing identity', async () => {
      const updateData = {
        handle: 'alice-new.dev.opnmt.me',
      };

      const updatedIdentity = { ...mockIdentity, ...updateData };
      repository.findOne.mockResolvedValue(
        mockIdentity as UserAtprotoIdentityEntity,
      );
      repository.save.mockResolvedValue(
        updatedIdentity as UserAtprotoIdentityEntity,
      );

      const result = await service.update(TESTING_TENANT_ID, 1, updateData);

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining(updateData),
      );
      expect(result?.handle).toBe('alice-new.dev.opnmt.me');
    });

    it('should return null when identity to update not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.update(TESTING_TENANT_ID, 999, {
        handle: 'new-handle',
      });

      expect(result).toBeNull();
    });

    it('should update pdsCredentials when provided', async () => {
      const updateData = {
        pdsCredentials: { password: 'new-encrypted-password' },
      };

      const updatedIdentity = { ...mockIdentity, ...updateData };
      repository.findOne.mockResolvedValue(
        mockIdentity as UserAtprotoIdentityEntity,
      );
      repository.save.mockResolvedValue(
        updatedIdentity as UserAtprotoIdentityEntity,
      );

      const result = await service.update(TESTING_TENANT_ID, 1, updateData);

      expect(result?.pdsCredentials).toEqual({
        password: 'new-encrypted-password',
      });
    });
  });
});
