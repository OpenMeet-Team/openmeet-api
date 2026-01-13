import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupMemberQueryService } from './group-member-query.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupRoleService } from '../group-role/group-role.service';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import { GroupPermission, GroupRole } from '../core/constants/constant';

describe('GroupMemberQueryService', () => {
  let service: GroupMemberQueryService;
  let mockRepository: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    // Set up mock query builder for findGroupDetailsMembers
    mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockRepository),
      }),
    };

    const mockGroupRoleService = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        name: GroupRole.Member,
      }),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupMemberQueryService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: GroupRoleService,
          useValue: mockGroupRoleService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<GroupMemberQueryService>(GroupMemberQueryService);
  });

  describe('orphaned groupMember handling (soft-deleted users)', () => {
    /**
     * Bug reproduction test: When a user is soft-deleted, their groupMember records
     * remain but the user relation returns null. This causes null reference errors
     * when the code tries to access user.email, user.firstName, etc.
     *
     * Real case: User 204 was soft-deleted on 2025-08-18, but groupMember 137 still
     * references them. This caused crashes in:
     * - Email send at group-mail.service.ts - "Cannot read properties of null (reading 'email')"
     * - "Send to 0 members" dialog - API returns user: null, frontend crashes
     */

    describe('getMailServiceGroupMembersByPermission', () => {
      it('should filter out members with null/deleted users', async () => {
        // Arrange: Simulate a mix of valid and orphaned group members
        const mockGroupMembers = [
          {
            id: 135,
            user: {
              id: 100,
              firstName: 'Active',
              lastName: 'User',
              name: 'Active User',
              email: 'active@example.com',
            },
          },
          {
            id: 137,
            user: null, // Orphaned - user was soft-deleted
          },
          {
            id: 138,
            user: {
              id: 102,
              firstName: 'Another',
              lastName: 'User',
              name: 'Another User',
              email: 'another@example.com',
            },
          },
        ] as unknown as GroupMemberEntity[];

        mockRepository.find.mockResolvedValue(mockGroupMembers);

        // Act
        const result = await service.getMailServiceGroupMembersByPermission(
          17, // groupId (e.g., Kona Freethinkers)
          GroupPermission.SeeGroup,
          'test-tenant',
        );

        // Assert: Should only return users from members with valid user references
        expect(result).toHaveLength(2);
        expect(result.every((user) => user !== null)).toBe(true);
        expect(result.map((u) => u.email)).toEqual([
          'active@example.com',
          'another@example.com',
        ]);
      });

      it('should return empty array when all members have deleted users', async () => {
        const mockGroupMembers = [
          { id: 137, user: null },
          { id: 138, user: null },
        ] as unknown as GroupMemberEntity[];

        mockRepository.find.mockResolvedValue(mockGroupMembers);

        const result = await service.getMailServiceGroupMembersByPermission(
          17,
          GroupPermission.SeeGroup,
          'test-tenant',
        );

        expect(result).toHaveLength(0);
      });
    });

    describe('getSpecificGroupMembers', () => {
      it('should filter out members with null/deleted users', async () => {
        const mockGroupMembers = [
          {
            id: 135,
            user: {
              id: 100,
              firstName: 'Active',
              lastName: 'User',
              name: 'Active User',
              email: 'active@example.com',
            },
          },
          {
            id: 137,
            user: null, // Orphaned
          },
        ] as unknown as GroupMemberEntity[];

        mockRepository.find.mockResolvedValue(mockGroupMembers);

        const result = await service.getSpecificGroupMembers(
          17,
          [100, 204], // Include the deleted user's ID
          'test-tenant',
        );

        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('active@example.com');
      });
    });

    describe('findGroupDetailsMembers', () => {
      it('should filter out members with null/deleted users', async () => {
        // This method uses query builder, so we mock getMany
        const mockGroupMembers = [
          {
            id: 135,
            user: {
              id: 100,
              slug: 'active-user',
              name: 'Active User',
              firstName: 'Active',
              lastName: 'User',
              email: 'active@example.com',
              photo: { path: '/path/to/photo' },
            },
            groupRole: { name: GroupRole.Member },
          },
          {
            id: 137,
            user: null, // Orphaned - user was soft-deleted
            groupRole: { name: GroupRole.Member },
          },
          {
            id: 138,
            user: {
              id: 102,
              slug: 'another-user',
              name: 'Another User',
              firstName: 'Another',
              lastName: 'User',
              email: 'another@example.com',
              photo: null,
            },
            groupRole: { name: GroupRole.Admin },
          },
        ];

        mockQueryBuilder.getMany.mockResolvedValue(mockGroupMembers);

        const result = await service.findGroupDetailsMembers(
          17,
          10, // limit
          'test-tenant',
        );

        // Should filter out the member with null user
        expect(result).toHaveLength(2);
        expect(result.every((member: any) => member.user !== null)).toBe(true);
        expect(result.map((m: any) => m.user.slug)).toEqual([
          'active-user',
          'another-user',
        ]);
      });
    });

    describe('getConfirmedGroupMembersForMatrix', () => {
      it('should filter out members with null/deleted users', async () => {
        const mockGroupMembers = [
          {
            id: 135,
            user: {
              id: 100,
              slug: 'active-user',
              firstName: 'Active',
              lastName: 'User',
              name: 'Active User',
            },
            groupRole: { name: GroupRole.Member },
          },
          {
            id: 137,
            user: null, // Orphaned
            groupRole: { name: GroupRole.Member },
          },
        ] as unknown as GroupMemberEntity[];

        mockRepository.find.mockResolvedValue(mockGroupMembers);

        const result = await service.getConfirmedGroupMembersForMatrix(
          17,
          'test-tenant',
        );

        expect(result).toHaveLength(1);
        expect(result[0].user).not.toBeNull();
        expect(result[0].user.slug).toBe('active-user');
      });
    });
  });
});
