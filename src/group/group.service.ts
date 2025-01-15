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
  ZULIP_DEFAULT_CHANNEL_TOPIC,
} from '../core/constants/constant';
import { GroupMemberService } from '../group-member/group-member.service';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { paginate } from '../utils/generic-pagination';
import { QueryGroupDto } from './dto/group-query.dto';
import slugify from 'slugify';
import { EventService } from '../event/event.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { FileEntity } from '../file/infrastructure/persistence/relational/entities/file.entity';
import { GroupRoleService } from '../group-role/group-role.service';
import { MailService } from '../mail/mail.service';
import { generateShortCode } from '../utils/short-code';
import { UpdateGroupMemberRoleDto } from '../group-member/dto/create-groupMember.dto';
import { ZulipMessage, ZulipTopic } from 'zulip-js';
import { ZulipService } from '../zulip/zulip.service';
import { UserService } from '../user/user.service';
import { HomeQuery } from '../home/dto/home-query.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupRoleEntity } from '../group-role/infrastructure/persistence/relational/entities/group-role.entity';
import { GroupMailService } from '../group-mail/group-mail.service';
import { AuditLoggerService } from '../logger/audit-logger.provider';
import { Trace } from '../utils/trace.decorator';

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
    private readonly eventService: EventService,
    private readonly fileService: FilesS3PresignedService,
    private readonly groupRoleService: GroupRoleService,
    private readonly mailService: MailService,
    private readonly zulipService: ZulipService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
    private readonly groupMailService: GroupMailService,
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
      return this.eventService.showRandomEvents(4);
    }

    const categoryIds = group.categories?.map((c) => c?.id);
    let events: EventEntity[] = [];

    try {
      // Get recommended events
      events =
        (await this.eventService.findRecommendedEventsForGroup(
          group.id,
          categoryIds,
          minEvents,
          maxEvents,
        )) || [];

      // If we need more events, get random ones
      if (events.length < maxEvents) {
        const randomEvents = await this.eventService.findRandomEventsForGroup(
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
    this.eventEmitter.emit('group.created', savedGroup);

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

    // Build visibility conditions
    if (userId) {
      // For authenticated users: show public, authenticated, and private groups they're members of
      groupQuery
        .leftJoin('group.groupMembers', 'members', 'members.userId = :userId', {
          userId,
        })
        .andWhere(
          '(group.visibility = :publicVisibility OR ' +
            'group.visibility = :authenticatedVisibility OR ' +
            '(group.visibility = :privateVisibility AND members.id IS NOT NULL))',
          {
            publicVisibility: GroupVisibility.Public,
            authenticatedVisibility: GroupVisibility.Authenticated,
            privateVisibility: GroupVisibility.Private,
          },
        );
    } else {
      // For anonymous users: show only public groups
      groupQuery.andWhere('group.visibility = :publicVisibility', {
        publicVisibility: GroupVisibility.Public,
      });
    }

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
  ): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const { page, limit } = pagination;
    const { search } = query;
    const groupQuery = this.groupRepository
      .createQueryBuilder('group')
      .where('group.status = :status', { status: GroupStatus.Published })
      .select(['group.name', 'group.slug']);

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
    messages: ZulipMessage[];
    topics: ZulipTopic[];
  }> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.getGroupBySlug(slug);

    group.events = await this.eventService.findUpcomingEventsForGroup(
      group.id,
      5,
    );

    group.groupMembers = await this.groupMemberService.findGroupDetailsMembers(
      group.id,
      5,
    );

    if (group.zulipChannelId) {
      group.topics = (
        await this.zulipService.getAdminStreamTopics(group.zulipChannelId)
      ).filter((t) => t.name !== ZULIP_DEFAULT_CHANNEL_TOPIC);

      group.messages = await this.zulipService.getAdminMessages({
        anchor: 'oldest',
        num_before: 0,
        num_after: 100,
        narrow: [{ operator: 'stream', operand: group.zulipChannelId }],
      });
    }

    return {
      events: group.events,
      groupMembers: group.groupMembers,
      messages: group.messages || [],
      topics: group.topics || [],
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

    const events = this.eventService.findRandom();
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

    const mappedGroupDto = {
      ...updateGroupDto,
      categories: categoryEntities,
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

    const updatedGroup = this.groupRepository.merge(group, mappedGroupDto);
    const savedGroup = await this.groupRepository.save(updatedGroup);
    this.auditLogger.log('group updated', {
      savedGroup,
    });
    this.eventEmitter.emit('group.updated', savedGroup);
    return savedGroup;
  }

  async remove(slug: string): Promise<void> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.getGroupBySlug(slug);

    // First, delete all group members associated with the group
    await this.groupMembersRepository.delete({ group: { id: group.id } });
    await this.eventService.deleteEventsByGroup(group.id);

    const deletedGroup = await this.groupRepository.remove(group);
    this.eventEmitter.emit('group.deleted', deletedGroup);
    this.auditLogger.log('group deleted', {
      deletedGroup,
    });
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
      .innerJoin('group.groupMembers', 'member', 'member.userId = :userId', {
        userId,
      })
      .where('groupRole.name != :ownerRole', { ownerRole: GroupRole.Owner })
      .getMany();
  }

  async approveMember(slug: string, groupMemberId: number) {
    await this.getTenantSpecificGroupRepository();
    await this.getGroupBySlug(slug);
    return await this.groupMemberService.approveMember(groupMemberId);
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

    if (
      groupEntity?.requireApproval ||
      groupEntity?.visibility === GroupVisibility.Private
    ) {
      const groupMember = await this.groupMemberService.createGroupMember(
        { userId: userEntity.id, groupId: groupEntity.id },
        GroupRole.Guest,
      );

      await this.groupMailService.sendGroupGuestJoined(groupMember.id);
    } else {
      await this.groupMemberService.createGroupMember(
        { userId: userEntity.id, groupId: groupEntity.id },
        GroupRole.Member,
      );
    }

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
  ) {
    await this.getTenantSpecificGroupRepository();

    await this.groupMemberService.updateGroupMemberRole(
      groupMemberId,
      updateDto,
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

    return await this.eventService.findEventsForGroup(group.id, 0);
  }

  async showGroupDiscussions(
    slug: string,
  ): Promise<{ messages: ZulipMessage[]; topics: ZulipTopic[] }> {
    await this.getTenantSpecificGroupRepository();

    const group = await this.groupRepository.findOne({
      where: { slug },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (!group.zulipChannelId) {
      return {
        messages: [],
        topics: [],
      };
    }

    const messages = await this.zulipService.getAdminMessages({
      anchor: 'oldest',
      num_before: 0,
      num_after: 100,
      narrow: [{ operator: 'channel', operand: group.zulipChannelId }],
    });

    const topics = (
      await this.zulipService.getAdminStreamTopics(group.zulipChannelId)
    ).filter((t) => t.name !== ZULIP_DEFAULT_CHANNEL_TOPIC);

    return {
      messages,
      topics,
    };
  }

  async sendGroupDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName: string },
  ): Promise<{ id: number }> {
    await this.getTenantSpecificGroupRepository();

    const group = await this.getGroupBySlug(slug);
    const user = await this.userService.getUserById(userId);

    const groupChannelName = `tenant_${this.request.tenantId}__group_${group.ulid}`;
    if (!group.zulipChannelId) {
      // create channel
      await this.zulipService.subscribeAdminToChannel({
        subscriptions: [
          {
            name: groupChannelName,
          },
        ],
      });

      const stream = await this.zulipService.getAdminStreamId(groupChannelName);

      group.zulipChannelId = stream.id;
      await this.groupRepository.save(group);
    }

    await this.zulipService.getInitialisedClient(user);

    const updatedUser = await this.userService.findOne(user.id);
    if (!updatedUser) {
      console.log('User not found after reload');
      throw new Error('User not found after reload');
    }

    const params = {
      to: group.zulipChannelId,
      type: 'channel' as const,
      topic: body.topicName,
      content: body.message,
    };

    const message = await this.zulipService.sendUserMessage(
      updatedUser,
      params,
    );
    console.log('message', message);
    return message;
  }

  async updateGroupDiscussionMessage(
    messageId: number,
    message: string,
    userId: number,
  ): Promise<{ id: number }> {
    const user = await this.userService.getUserById(userId);
    return await this.zulipService.updateUserMessage(user, messageId, message);
    // return await this.zulipService.updateAdminMessage(messageId, message);
  }

  async deleteGroupDiscussionMessage(
    messageId: number,
  ): Promise<{ id: number }> {
    return await this.zulipService.deleteAdminMessage(messageId);
  }

  async showDashboardGroups(userId: number): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();

    const groupsByMember = await this.getGroupsByMember(userId);

    const groupsByCreator = await this.getGroupsByCreator(userId);

    const groups = [...groupsByMember, ...groupsByCreator];
    const uniqueGroups = Array.from(
      new Map(groups.map((group) => [group.id, group])).values(),
    );

    return (await Promise.all(
      uniqueGroups.map(async (group) => ({
        ...group,
        groupMember: await this.groupMemberService.findGroupMemberByUserId(
          group.id,
          Number(userId),
        ),
      })),
    )) as GroupEntity[];
  }

  async getGroupMembers(groupId: number): Promise<GroupMemberEntity[]> {
    await this.getTenantSpecificGroupRepository();
    return this.groupMembersRepository.find({
      where: {
        group: { id: groupId },
      },
      relations: ['groupRole', 'groupRole.groupPermissions'],
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
}
