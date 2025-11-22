import {
  Injectable,
  NotFoundException,
  Inject,
  Scope,
  UnprocessableEntityException,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CategoryService } from '../category/category.service';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './infrastructure/persistence/relational/entities/group-user-permission.entity';
import {
  DEFAULT_RADIUS,
  GroupPermission,
  GroupRole,
  GroupStatus,
  GroupVisibility,
  PostgisSrid,
} from '../core/constants/constant';
import { GroupMemberService } from '../group-member/group-member.service';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { paginate } from '../utils/generic-pagination';
import { QueryGroupDto } from './dto/group-query.dto';
import slugify from 'slugify';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { FileEntity } from '../file/infrastructure/persistence/relational/entities/file.entity';
import { GroupRoleService } from '../group-role/group-role.service';
import { MailService } from '../mail/mail.service';
import { generateShortCode } from '../utils/short-code';
import { UpdateGroupMemberRoleDto } from '../group-member/dto/create-groupMember.dto';
// import { MatrixMessage } from '../matrix/matrix-types';
import { UserService } from '../user/user.service';
import { HomeQuery } from '../home/dto/home-query.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupRoleEntity } from '../group-role/infrastructure/persistence/relational/entities/group-role.entity';
import { GroupMailService } from '../group-mail/group-mail.service';
import { AuditLoggerService } from '../logger/audit-logger.provider';
import { Trace } from '../utils/trace.decorator';
import { EventQueryService } from '../event/services/event-query.service';
import { EventManagementService } from '../event/services/event-management.service';
import { EventRecommendationService } from '../event/services/event-recommendation.service';
// import { forwardRef } from '@nestjs/common'; // Currently not used
// ChatRoomService removed - Matrix Application Service handles room operations directly

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupService {
  private readonly auditLogger = AuditLoggerService.getInstance();
  private readonly logger = new Logger(GroupService.name);

  private groupMembersRepository: Repository<GroupMemberEntity>;
  private groupRepository: Repository<GroupEntity>;
  private groupMemberPermissionsRepository: Repository<GroupUserPermissionEntity>;
  private groupRoleRepository: Repository<GroupRoleEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
    private readonly groupMemberService: GroupMemberService,
    private readonly eventQueryService: EventQueryService,
    private readonly eventManagementService: EventManagementService,
    private readonly eventRecommendationService: EventRecommendationService,
    private readonly fileService: FilesS3PresignedService,
    private readonly groupRoleService: GroupRoleService,
    private readonly mailService: MailService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
    private readonly groupMailService: GroupMailService,
    // ChatRoomService removed - Matrix Application Service handles room operations directly
  ) {}

  async getTenantSpecificGroupRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.groupRepository = dataSource.getRepository(GroupEntity);
    this.groupMembersRepository = dataSource.getRepository(GroupMemberEntity);
    this.groupMemberPermissionsRepository = dataSource.getRepository(
      GroupUserPermissionEntity,
    );
    this.groupRoleRepository = dataSource.getRepository(GroupRoleEntity);
  }

  /**
   * Apply visibility filtering to group queries based on authentication and membership.
   *
   * Implements the visibility model:
   * - Public: Always visible to everyone
   * - Unlisted: Only visible to actual members (not all authenticated users)
   * - Private: Only visible to actual members
   *
   * "Unlisted" means not discoverable unless you have the URL and joined as a member.
   *
   * @param queryBuilder - The query builder to apply filters to
   * @param userId - Optional user ID for authenticated users
   * @returns The query builder with visibility filters applied
   */
  private applyGroupVisibilityFilter(queryBuilder: any, userId?: number): any {
    if (userId) {
      // Authenticated users: show Public + Unlisted (if member) + Private (if member)
      // Key: Must be an actual member, not just logged in
      queryBuilder.leftJoin(
        'group.groupMembers',
        'visibilityMembers',
        'visibilityMembers.userId = :userId',
        { userId },
      );

      queryBuilder.andWhere(
        '(group.visibility = :publicVisibility OR ' +
          '(group.visibility = :unlistedVisibility AND visibilityMembers.id IS NOT NULL) OR ' +
          '(group.visibility = :privateVisibility AND visibilityMembers.id IS NOT NULL))',
        {
          publicVisibility: GroupVisibility.Public,
          unlistedVisibility: GroupVisibility.Unlisted,
          privateVisibility: GroupVisibility.Private,
        },
      );
    } else {
      // Anonymous users: show only Public groups
      queryBuilder.andWhere('group.visibility = :publicVisibility', {
        publicVisibility: GroupVisibility.Public,
      });
    }

    return queryBuilder;
  }

  async getGroupsWhereUserCanCreateEvents(
    userId: number,
  ): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    return this.groupRepository.find({
      where: {
        groupMembers: {
          user: { id: userId },
          groupRole: {
            groupPermissions: { name: GroupPermission.CreateEvent },
          },
        },
      },
    });
  }

  async getGroupsByCreator(userId: number): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();

    const groups = await this.groupRepository.find({
      where: {
        groupMembers: { user: { id: userId } },
      },
      relations: ['createdBy'],
    });
    return groups;
  }

  async getGroupsByMember(userId: number): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    const groups = await this.groupRepository.find({
      where: {
        groupMembers: { user: { id: userId } },
      },
      relations: ['createdBy'],
    });
    return groups;
  }

  async showGroupRecommendedEvents(
    slug?: string,
    minEvents: number = 3,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    await this.getTenantSpecificGroupRepository();

    const group = await this.groupRepository.findOne({
      where: { slug },
      relations: ['categories'],
    });

    if (!group) {
      return this.eventRecommendationService.showRandomEvents(4);
    }

    const categoryIds = group.categories?.map((c) => c?.id);
    let events: EventEntity[] = [];

    try {
      // Get recommended events
      events =
        (await this.eventRecommendationService.findRecommendedEventsForGroup(
          group.id,
          categoryIds,
          minEvents,
          maxEvents,
        )) || [];

      // If we need more events, get random ones
      if (events.length < maxEvents) {
        const randomEvents =
          await this.eventRecommendationService.findRandomEventsForGroup(
            group.id,
            maxEvents - events.length,
            maxEvents - events.length,
          );
        events = [...events, ...randomEvents];
      }
    } catch (error) {
      this.logger.error('Error fetching events:', error);
    }

    // Return unique events
    return Array.from(
      new Map(events.map((event) => [event.id, event])).values(),
    );
  }

  async create(createGroupDto: CreateGroupDto, userId: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    let categoryEntities: any[] = [];
    const categoryIds = createGroupDto.categories;

    if (categoryIds && categoryIds.length > 0) {
      categoryEntities = await Promise.all(
        categoryIds.map(async (categoryId) => {
          const categoryEntity = await this.categoryService.findOne(categoryId);
          if (!categoryEntity) {
            throw new NotFoundException(
              `Category with ID ${categoryId} not found`,
            );
          }
          return categoryEntity;
        }),
      );
    }

    const shortCode = await generateShortCode();
    const slugifiedName = `${slugify(createGroupDto.name, {
      strict: true,
      lower: true,
    })}-${shortCode.toLowerCase()}`;

    let locationPoint;
    if (createGroupDto.lat && createGroupDto.lon) {
      const { lat, lon } = createGroupDto;
      if (isNaN(lat) || isNaN(lon)) {
        throw new BadRequestException('Invalid latitude or longitude');
      }
      locationPoint = {
        type: 'Point',
        coordinates: [lon, lat],
      };
    }

    const mappedGroupDto = {
      ...createGroupDto,
      slug: slugifiedName,
      categories: categoryEntities,
      createdBy: { id: userId },
      locationPoint,
    };

    if (mappedGroupDto.image?.id) {
      const fileObject = await this.fileService.findById(
        mappedGroupDto.image.id,
      );

      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            image: 'imageNotExists',
          },
        });
      }

      mappedGroupDto.image = fileObject as FileEntity;
    }

    const group = this.groupRepository.create(mappedGroupDto);
    const savedGroup = await this.groupRepository.save(group);

    // Emit group creation event with tenant context (following event service pattern)
    this.logger.log('About to emit group.created event', {
      groupId: savedGroup.id,
      slug: savedGroup.slug,
      userId: userId,
      tenantId: this.request.tenantId,
    });
    this.eventEmitter.emit('group.created', {
      groupId: savedGroup.id,
      slug: savedGroup.slug,
      userId: userId, // Creator user ID
      tenantId: this.request.tenantId,
    });
    this.logger.log('group.created event emitted successfully');

    // Get the owner role
    const ownerRole = await this.groupRoleService.findOne(GroupRole.Owner);
    if (!ownerRole) {
      throw new NotFoundException('Owner role not found');
    }

    // Create group member record with owner role
    await this.groupMembersRepository.save({
      user: { id: userId },
      group: { id: savedGroup.id },
      groupRole: ownerRole,
    });

    this.auditLogger.log('group created', {
      savedGroup,
    });
    return savedGroup;
  }

  // Find all groups with relations
  @Trace()
  async showAll(
    pagination: PaginationDto,
    query: QueryGroupDto,
    userId?: number,
  ): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const { page, limit } = pagination;
    const { search, categories, radius, lat, lon } = query;

    this.logger.debug('showAll() Auth context:', {
      userId,
      hasUserId: !!userId,
    });

    const groupQuery = this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.categories', 'categories')
      .leftJoin('group.createdBy', 'user')
      .leftJoin('user.photo', 'photo')
      .leftJoin('group.image', 'groupImage')
      .addSelect(['user.name', 'user.slug', 'photo.path', 'groupImage.path'])
      .loadRelationCountAndMap(
        'group.groupMembersCount',
        'group.groupMembers',
        'groupMembers',
        (qb) =>
          qb
            .innerJoin('groupMembers.groupRole', 'role')
            .where('role.name != :roleName', {
              roleName: GroupRole.Guest,
            }),
      )
      .where('group.status = :status', { status: GroupStatus.Published });

    // Apply visibility filtering
    this.applyGroupVisibilityFilter(groupQuery, userId);

    // Add existing query conditions
    if (categories && categories.length > 0) {
      const likeConditions = categories
        .map((_, index) => `categories.name LIKE :category${index}`)
        .join(' OR ');

      const likeParameters = categories.reduce((acc, category, index) => {
        acc[`category${index}`] = `%${category}%`;
        return acc;
      }, {});

      groupQuery.andWhere(`(${likeConditions})`, likeParameters);
    }

    if (lat && lon) {
      if (isNaN(lon) || isNaN(lat)) {
        throw new BadRequestException(
          'Invalid location format. Expected "lon,lat".',
        );
      }

      const searchRadius = radius ?? DEFAULT_RADIUS;
      groupQuery.andWhere(
        `ST_DWithin(
          group.locationPoint,
          ST_SetSRID(ST_MakePoint(:lon, :lat), ${PostgisSrid.SRID}),
          :radius
        )`,
        { lon, lat, radius: searchRadius * 1000 },
      );
    }

    if (search) {
      groupQuery.andWhere(`group.name ILIKE :search`, {
        search: `%${search}%`,
      });
    }

    return await paginate(groupQuery, { page, limit });
  }

  async searchAllGroups(
    pagination: PaginationDto,
    query: HomeQuery,
    userId?: number,
  ): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const { page, limit } = pagination;
    const { search } = query;
    const groupQuery = this.groupRepository
      .createQueryBuilder('group')
      .where('group.status = :status', { status: GroupStatus.Published })
      .select(['group.id', 'group.name', 'group.slug']);

    // Apply visibility filtering
    this.applyGroupVisibilityFilter(groupQuery, userId);

    if (search) {
      groupQuery.andWhere('group.name ILIKE :search', {
        search: `%${search}%`,
      });
    }

    return await paginate(groupQuery, { page, limit });
  }

  async editGroup(slug: string): Promise<any> {
    await this.getTenantSpecificGroupRepository();

    return await this.groupRepository.findOne({
      where: { slug },
      relations: ['createdBy', 'categories'],
    });
  }

  async findOne(id: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { id },
      relations: [
        'events',
        'groupMembers',
        'groupMembers.user',
        'groupMembers.groupRole',
        'createdBy',
        'categories',
      ],
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    group.events = group.events?.slice(0, 5);
    group.groupMembers = group.groupMembers?.slice(0, 5);

    return group;
  }

  async findGroupBySlug(slug: string): Promise<GroupEntity> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
      relations: ['image', 'createdBy', 'categories'],
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${slug} not found`);
    }

    return group;
  }

  async showGroup(slug: string, userId?: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();

    const group = await this.groupRepository.findOne({
      where: { slug },
      relations: ['createdBy', 'categories'],
      select: {
        createdBy: {
          name: true,
          slug: true,
          photo: {
            path: true,
          },
        },
        categories: {
          id: true,
          name: true,
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (userId) {
      group.groupMember = await this.groupMemberService.findGroupMemberByUserId(
        group.id,
        userId,
      );
    }

    group.groupMembersCount =
      await this.groupMemberService.getGroupMembersCount(group.id);

    return group;
  }

  async showGroupAbout(slug: string): Promise<{
    events: EventEntity[];
    groupMembers: GroupMemberEntity[];
  }> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.getGroupBySlug(slug);

    group.events = await this.eventQueryService.findUpcomingEventsForGroup(
      group.id,
      5,
    );

    group.groupMembers = await this.groupMemberService.findGroupDetailsMembers(
      group.id,
      5,
    );

    // We now use Matrix exclusively for chat - messages are retrieved via Matrix API

    return {
      events: group.events,
      groupMembers: group.groupMembers,
    };
  }

  async findRandomEvents(id: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { id },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    const events = this.eventRecommendationService.findRandom();
    const groupWithEvents = {
      ...group,
      recommendedEvents: events,
    };

    return groupWithEvents;
  }

  async update(
    slug: string,
    updateGroupDto: UpdateGroupDto,
  ): Promise<GroupEntity> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.getGroupBySlug(slug);

    let categoryEntities: any[] = [];
    const categoryIds = updateGroupDto.categories;

    // Only process categories if they're included in the update
    if (categoryIds && categoryIds.length > 0) {
      categoryEntities = await Promise.all(
        categoryIds.map(async (categoryId) => {
          const categoryEntity = await this.categoryService.findOne(categoryId);
          if (!categoryEntity) {
            throw new NotFoundException(
              `Category with ID ${categoryId} not found`,
            );
          }
          return categoryEntity;
        }),
      );

      // Only include categories in the mapped DTO if they were provided
      updateGroupDto = {
        ...updateGroupDto,
        categories: categoryEntities,
      };
    }

    // Create a copy that won't affect the original updateGroupDto, but omit categories
    // which we'll handle separately
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { categories: _, ...otherProps } = updateGroupDto;
    const mappedGroupDto = { ...otherProps };

    if (mappedGroupDto.image?.id) {
      const fileObject = await this.fileService.findById(
        mappedGroupDto.image.id,
      );

      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            image: 'imageNotExists',
          },
        });
      }

      mappedGroupDto.image = fileObject as FileEntity;
    }

    // First merge the non-category properties
    const updatedGroup = this.groupRepository.merge(group, mappedGroupDto);

    // Handle categories separately if they were provided and updatedGroup exists
    try {
      if (categoryEntities.length > 0 && updatedGroup) {
        // Safely set categories
        updatedGroup.categories = categoryEntities;
      }
    } catch (error) {
      this.logger.warn(`Error setting categories: ${error.message}`);
      // Continue with the save operation even if categories can't be set
    }
    const savedGroup = await this.groupRepository.save(updatedGroup);
    this.auditLogger.log('group updated', {
      savedGroup,
    });
    this.eventEmitter.emit('group.updated', {
      groupId: savedGroup.id,
      slug: savedGroup.slug,
      tenantId: this.request.tenantId,
    });
    return savedGroup;
  }

  async remove(slug: string): Promise<void> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.getGroupBySlug(slug);
    const tenantId = this.request.tenantId;

    try {
      // We'll still emit the event for any listeners that might need it
      // but we won't rely on it for chat room cleanup
      this.eventEmitter.emit('group.before_delete', {
        groupId: group.id,
        groupSlug: group.slug,
        groupName: group.name,
        tenantId: tenantId,
      });

      // Directly handle chat room cleanup first to avoid foreign key issues
      try {
        this.logger.log(`Cleaning up chat rooms for group ${group.slug}`);

        // Clear the matrixRoomId reference on the group entity
        // Note: Matrix room cleanup should be handled by the Matrix service directly
        if (group.matrixRoomId) {
          group.matrixRoomId = '';
          await this.groupRepository.save(group);
          this.logger.log(
            `Cleared matrixRoomId reference for group ${group.slug}`,
          );
        }
      } catch (chatError) {
        // Log but continue with deletion - the foreign key issue may already be resolved
        this.logger.error(
          `Error cleaning up chat rooms: ${chatError.message}`,
          chatError.stack,
        );
      }

      // First, delete all group members associated with the group
      await this.groupMembersRepository.delete({ group: { id: group.id } });
      this.logger.log(`Deleted all group members for group ${group.slug}`);

      // Delete all events associated with the group
      await this.eventManagementService.deleteEventsByGroup(group.id);
      this.logger.log(`Deleted all events for group ${group.slug}`);

      // Now remove the group itself
      const deletedGroup = await this.groupRepository.remove(group);

      // Emit group deleted event after successful deletion
      this.eventEmitter.emit('group.deleted', deletedGroup);

      this.auditLogger.log('group deleted', {
        deletedGroup,
      });

      this.logger.log(`Successfully deleted group ${slug}`);
    } catch (error) {
      this.logger.error(
        `Error deleting group ${slug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getHomePageFeaturedGroups(): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();

    const groups = await this.groupRepository
      .createQueryBuilder('group')
      .select(['group'])
      .leftJoinAndSelect('group.groupMembers', 'groupMembers')
      .leftJoinAndSelect('group.categories', 'categories')
      .leftJoinAndSelect('group.image', 'image')
      .where({
        visibility: GroupVisibility.Public,
        status: GroupStatus.Published,
      })
      .orderBy('RANDOM()')
      .limit(5)
      .getMany();

    return groups;
  }

  async getHomePageUserCreatedGroups(
    userId: number,
    take: number = 0,
  ): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    const groups = await this.groupRepository.find({
      where: { createdBy: { id: userId } },
      take,
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });

    return await Promise.all(
      groups.map(async (group) => {
        group.groupMembersCount =
          await this.groupMemberService.getGroupMembersCount(group.id);
        return group;
      }),
    );
  }

  async getHomePageUserParticipatedGroups(
    userId: number,
    // take: number = 0,
  ): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();

    return await this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.groupMembers', 'groupMembers')
      .leftJoinAndSelect('groupMembers.groupRole', 'groupRole')
      .leftJoinAndSelect('group.image', 'image')
      .innerJoin('group.groupMembers', 'member', 'member.userId = :userId', {
        userId,
      })
      .where('groupRole.name != :ownerRole', { ownerRole: GroupRole.Owner })
      .getMany();
  }

  async approveMember(slug: string, groupMemberId: number) {
    await this.getTenantSpecificGroupRepository();
    const groupEntity = await this.getGroupBySlug(slug);

    // Get member details before approval for Matrix integration
    const groupMember = await this.groupMemberService
      .findGroupDetailsMembers(groupEntity.id, 0)
      .then((members) => members.find((m) => m.id === groupMemberId));

    if (!groupMember) {
      throw new NotFoundException('Group member not found');
    }

    const result = await this.groupMemberService.approveMember(groupMemberId);

    // Emit event for Matrix integration to add newly approved member to group chat
    this.eventEmitter.emit('chat.group.member.add', {
      groupSlug: groupEntity.slug,
      userSlug: groupMember.user.slug,
      tenantId: this.request.tenantId,
    });
    this.logger.log(
      `Emitted chat.group.member.add event for approved user ${groupMember.user.slug} in group ${groupEntity.slug}`,
    );

    return result;
  }

  async rejectMember(slug: string, groupMemberId: number) {
    await this.getTenantSpecificGroupRepository();
    await this.getGroupBySlug(slug);
    return await this.groupMemberService.rejectMember(groupMemberId);
  }

  async joinGroup(slug: string, userId: number) {
    await this.getTenantSpecificGroupRepository();
    const groupEntity = await this.getGroupBySlug(slug);
    const userEntity = await this.userService.getUserById(userId);

    const groupMember = await this.groupMemberService.findGroupMemberByUserId(
      groupEntity.id,
      userEntity.id,
    );

    if (groupMember) {
      return groupMember;
    }

    let assignedRole: GroupRole;
    let newGroupMember;

    if (
      groupEntity?.requireApproval ||
      groupEntity?.visibility === GroupVisibility.Private
    ) {
      newGroupMember = await this.groupMemberService.createGroupMember(
        { userId: userEntity.id, groupId: groupEntity.id },
        GroupRole.Guest,
      );
      assignedRole = GroupRole.Guest;

      await this.groupMailService.sendGroupGuestJoined(newGroupMember.id);
    } else {
      newGroupMember = await this.groupMemberService.createGroupMember(
        { userId: userEntity.id, groupId: groupEntity.id },
        GroupRole.Member,
      );
      assignedRole = GroupRole.Member;
    }

    // Emit event for Matrix integration to add user to group chat for ALL group types
    // The Matrix event listener will handle role-based permissions appropriately
    this.eventEmitter.emit('chat.group.member.add', {
      groupSlug: groupEntity.slug,
      userSlug: userEntity.slug,
      userRole: assignedRole,
      tenantId: this.request.tenantId,
    });
    this.logger.log(
      `Emitted chat.group.member.add event for user ${userEntity.slug} in group ${groupEntity.slug} with role ${assignedRole}`,
    );

    return await this.groupMemberService.findGroupMemberByUserId(
      groupEntity.id,
      userEntity.id,
    );
  }

  async leaveGroup(slug: string, userId: number) {
    await this.getTenantSpecificGroupRepository();
    const group = await this.getGroupBySlug(slug);
    return await this.groupMemberService.leaveGroup(userId, group.id);
  }

  async removeGroupMember(slug: string, groupMemberId: number) {
    await this.getTenantSpecificGroupRepository();
    const group = await this.getGroupBySlug(slug);
    return await this.groupMemberService.removeGroupMember(
      group.id,
      groupMemberId,
    );
  }

  async updateGroupMemberRole(
    slug: string,
    groupMemberId: number,
    updateDto: UpdateGroupMemberRoleDto,
    actingUserId: number,
  ) {
    await this.getTenantSpecificGroupRepository();

    await this.groupMemberService.updateGroupMemberRole(
      groupMemberId,
      updateDto,
      actingUserId,
    );

    const showGroupMember =
      await this.groupMemberService.showGroupDetailsMember(groupMemberId);

    await this.groupMailService.sendGroupMemberRoleUpdated(groupMemberId);
    return showGroupMember;
  }

  async showGroupMembers(slug: string): Promise<GroupMemberEntity[]> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.getGroupBySlug(slug);
    return await this.groupMemberService.findGroupDetailsMembers(group.id, 0);
  }

  async showGroupEvents(slug: string): Promise<EventEntity[]> {
    await this.getTenantSpecificGroupRepository();

    const group = await this.getGroupBySlug(slug);

    return await this.eventQueryService.findEventsForGroup(group.id, 0);
  }

  // DEPRECATED: Group discussions method removed
  // Events are handling Matrix chats correctly - groups will be adapted later

  async showDashboardGroups(userId: number): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();

    // Define a type extension for GroupEntity to include our extra properties
    type ExtendedGroupEntity = GroupEntity & {
      isCreator: boolean;
      upcomingEventsCount: number;
    };

    // First get groups where user is a member with all necessary relations loaded
    const groupsQuery = this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.groupMembers', 'groupMember')
      .leftJoinAndSelect('groupMember.user', 'memberUser')
      .leftJoinAndSelect('groupMember.groupRole', 'groupRole')
      .leftJoinAndSelect('group.createdBy', 'createdBy')
      .leftJoinAndSelect('group.categories', 'categories')
      .leftJoinAndSelect('group.image', 'image')
      .where('groupMember.user.id = :userId', { userId });

    const groups = await groupsQuery.getMany();

    // Deduplicate groups by ID to ensure we don't have duplicates
    const uniqueGroups = Array.from(
      new Map(groups.map((group) => [group.id, group])).values(),
    );

    // For each group, add the user's membership information with proper role data
    const groupsWithMembership = (await Promise.all(
      uniqueGroups.map(async (group) => {
        // Get the user's membership for this group with complete role information
        const groupMember =
          await this.groupMemberService.findGroupMemberByUserId(
            group.id,
            userId,
          );

        // Get upcoming events count for this group
        const upcomingEventsCount = await this.eventQueryService
          .findUpcomingEventsForGroup(group.id, 1)
          .then((events) => events.length);

        // Create a new object with our extended properties
        const extendedGroup = {
          ...group,
          groupMember,
          upcomingEventsCount,
          isCreator: group.createdBy?.id === userId,
        };

        return extendedGroup;
      }),
    )) as ExtendedGroupEntity[];

    // Sort groups: created groups first, then member groups
    return groupsWithMembership.sort((a, b) => {
      // Sort by creator status first
      if (a.isCreator && !b.isCreator) return -1;
      if (!a.isCreator && b.isCreator) return 1;

      // Then sort by name
      return a.name.localeCompare(b.name);
    });
  }

  async getGroupMembers(groupId: number): Promise<GroupMemberEntity[]> {
    await this.getTenantSpecificGroupRepository();
    return this.groupMembersRepository.find({
      where: {
        group: { id: groupId },
      },
      relations: ['user', 'groupRole', 'groupRole.groupPermissions'],
    });
  }

  async getGroupMemberPermissions(
    userId: number,
    groupId: number,
  ): Promise<GroupUserPermissionEntity[]> {
    await this.getTenantSpecificGroupRepository();
    return this.groupMemberPermissionsRepository.find({
      where: {
        user: { id: userId },
        group: { id: groupId },
      },
      relations: ['groupPermission'],
    });
  }

  async getGroupBySlug(slug: string): Promise<GroupEntity> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
    });
    if (!group) {
      throw new NotFoundException('Group by slug not found');
    }
    return group;
  }

  /**
   * Get all groups that have Matrix chat rooms
   */
  async getAllGroupsWithMatrixRooms(
    tenantId: string,
  ): Promise<Array<{ slug: string; matrixRoomId: string; name: string }>> {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const groupRepository = dataSource.getRepository(GroupEntity);

    const groups = await groupRepository
      .createQueryBuilder('group')
      .select(['group.slug', 'group.matrixRoomId', 'group.name'])
      .where('group.matrixRoomId IS NOT NULL')
      .getMany();

    return groups.map((group) => ({
      slug: group.slug,
      matrixRoomId: group.matrixRoomId!,
      name: group.name,
    }));
  }

  /**
   * Update the Matrix room ID for a group using tenant-aware method
   */
  async updateMatrixRoomId(
    groupId: number,
    matrixRoomId: string,
    tenantId: string,
  ): Promise<void> {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const groupRepository = dataSource.getRepository(GroupEntity);

    await groupRepository.update(groupId, { matrixRoomId });
    this.logger.log(
      `Updated group ${groupId} matrixRoomId to: ${matrixRoomId}`,
    );
  }
}
