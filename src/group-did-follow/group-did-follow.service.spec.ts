import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { GroupDIDFollowService } from './group-did-follow.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { GroupRole } from '../core/constants/constant';

describe('GroupDIDFollowService', () => {
  let service: GroupDIDFollowService;

  const mockRequest = { tenantId: 'test-tenant' };

  const mockGroup = { id: 1, slug: 'test-group' };
  const mockUser = { id: 42 };
  const mockOwnerMember = {
    id: 1,
    user: mockUser,
    group: mockGroup,
    groupRole: { name: GroupRole.Owner },
  };

  const mockFollowEntity = {
    id: 1,
    did: 'did:plc:abc123',
    group: mockGroup,
    createdBy: mockUser,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockFollowRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockGroupRepo = {
    findOne: jest.fn(),
  };

  const mockMemberRepo = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    getRepository: jest.fn((entity) => {
      const name = entity.name || entity.toString();
      if (name === 'GroupDIDFollowEntity') return mockFollowRepo;
      if (name === 'GroupEntity') return mockGroupRepo;
      if (name === 'GroupMemberEntity') return mockMemberRepo;
      return {};
    }),
  };

  const mockTenantConnectionService = {
    getTenantConnection: jest.fn().mockResolvedValue(mockDataSource),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupDIDFollowService,
        { provide: REQUEST, useValue: mockRequest },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = await module.resolve<GroupDIDFollowService>(
      GroupDIDFollowService,
    );
  });

  describe('addFollow', () => {
    it('should add a DID follow to a group', async () => {
      mockGroupRepo.findOne.mockResolvedValue(mockGroup);
      mockMemberRepo.findOne.mockResolvedValue(mockOwnerMember);
      mockFollowRepo.findOne.mockResolvedValue(null);
      mockFollowRepo.create.mockReturnValue(mockFollowEntity);
      mockFollowRepo.save.mockResolvedValue(mockFollowEntity);

      const result = await service.addFollow(
        'test-group',
        { did: 'did:plc:abc123' },
        mockUser.id,
      );

      expect(result.id).toBe(1);
      expect(result.did).toBe('did:plc:abc123');
      expect(mockFollowRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when group not found', async () => {
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addFollow(
          'nonexistent',
          { did: 'did:plc:abc123' },
          mockUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when DID already followed', async () => {
      mockGroupRepo.findOne.mockResolvedValue(mockGroup);
      mockMemberRepo.findOne.mockResolvedValue(mockOwnerMember);
      mockFollowRepo.findOne.mockResolvedValue(mockFollowEntity);

      await expect(
        service.addFollow('test-group', { did: 'did:plc:abc123' }, mockUser.id),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException when user is not owner/admin', async () => {
      mockGroupRepo.findOne.mockResolvedValue(mockGroup);
      mockMemberRepo.findOne.mockResolvedValue({
        ...mockOwnerMember,
        groupRole: { name: GroupRole.Moderator },
      });

      await expect(
        service.addFollow('test-group', { did: 'did:plc:abc123' }, mockUser.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      mockGroupRepo.findOne.mockResolvedValue(mockGroup);
      mockMemberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addFollow('test-group', { did: 'did:plc:abc123' }, mockUser.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeFollow', () => {
    it('should remove a DID follow from a group', async () => {
      mockGroupRepo.findOne.mockResolvedValue(mockGroup);
      mockMemberRepo.findOne.mockResolvedValue(mockOwnerMember);
      mockFollowRepo.findOne.mockResolvedValue(mockFollowEntity);

      await service.removeFollow('test-group', 'did:plc:abc123', mockUser.id);

      expect(mockFollowRepo.remove).toHaveBeenCalledWith(mockFollowEntity);
    });

    it('should throw NotFoundException when follow not found', async () => {
      mockGroupRepo.findOne.mockResolvedValue(mockGroup);
      mockMemberRepo.findOne.mockResolvedValue(mockOwnerMember);
      mockFollowRepo.findOne.mockResolvedValue(null);

      await expect(
        service.removeFollow('test-group', 'did:plc:notfound', mockUser.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listFollows', () => {
    it('should return all DID follows for a group', async () => {
      mockGroupRepo.findOne.mockResolvedValue(mockGroup);
      mockMemberRepo.findOne.mockResolvedValue(mockOwnerMember);
      mockFollowRepo.find.mockResolvedValue([mockFollowEntity]);

      const result = await service.listFollows('test-group', mockUser.id);

      expect(result).toHaveLength(1);
      expect(result[0].did).toBe('did:plc:abc123');
    });

    it('should return empty array when no follows exist', async () => {
      mockGroupRepo.findOne.mockResolvedValue(mockGroup);
      mockMemberRepo.findOne.mockResolvedValue(mockOwnerMember);
      mockFollowRepo.find.mockResolvedValue([]);

      const result = await service.listFollows('test-group', mockUser.id);

      expect(result).toHaveLength(0);
    });
  });

  describe('getFollowedDidsForGroup', () => {
    it('should return DIDs followed by a group', async () => {
      mockFollowRepo.find.mockResolvedValue([
        { did: 'did:plc:aaa' },
        { did: 'did:plc:bbb' },
      ]);

      const result = await service.getFollowedDidsForGroup(1);

      expect(result).toEqual(['did:plc:aaa', 'did:plc:bbb']);
      expect(mockFollowRepo.find).toHaveBeenCalledWith({
        where: { group: { id: 1 } },
        select: ['did'],
      });
    });

    it('should return empty array when no follows exist', async () => {
      mockFollowRepo.find.mockResolvedValue([]);

      const result = await service.getFollowedDidsForGroup(1);

      expect(result).toEqual([]);
    });
  });
});
