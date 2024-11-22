import {
  Injectable,
  NotFoundException,
  Inject,
  Scope,
  UnprocessableEntityException,
  HttpStatus,
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
  GroupPermission,
  GroupRole,
  GroupStatus,
  GroupVisibility,
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

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupService {
  private groupMembersRepository: Repository<GroupMemberEntity>;
  private groupRepository: Repository<GroupEntity>;
  private readonly groupMemberPermissionsRepository: Repository<GroupUserPermissionEntity>;

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
  ) {}

  async getTenantSpecificGroupRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.groupRepository = dataSource.getRepository(GroupEntity);
    this.groupMembersRepository = dataSource.getRepository(GroupMemberEntity);
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

  async getGroupMembers(
    userId: number,
    groupId: number,
  ): Promise<GroupMemberEntity[]> {
    await this.getTenantSpecificGroupRepository();
    const groupMembers = await this.groupMembersRepository.find({
      where: {
        user: { id: userId },
        group: { id: groupId },
      },
    });

    return groupMembers;
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

  async getGroupsByCreator(userId: number): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    // find where groupMembers user id == userid
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
    slug: string,
    minEvents: number = 3,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    await this.getTenantSpecificGroupRepository();

    const group = await this.groupRepository.findOne({
      where: { slug },
      relations: ['categories'],
    });

    if (!group) {
      return await this.eventService.showRandomEvents(4);
    } else {
      const categoryIds = group.categories.map((c) => c.id);

      let recommendedEvents: EventEntity[] = [];
      try {
        recommendedEvents =
          (await this.eventService.findRecommendedEventsForGroup(
            group.id,
            categoryIds,
            minEvents,
            maxEvents,
          )) || ([] as EventEntity[]);
      } catch (error) {
        recommendedEvents = [] as EventEntity[];
        console.error('Error fetching recommended events:', error);
      }

      const remainingEventsToFetch = maxEvents - recommendedEvents.length;

      if (remainingEventsToFetch > 0) {
        let randomEvents: EventEntity[] = [];
        try {
          randomEvents = await this.eventService.findRandomEventsForGroup(
            group.id,
            remainingEventsToFetch,
            remainingEventsToFetch,
          );
        } catch (error) {
          console.error('Error fetching random events:', error);
        }

        recommendedEvents = [...recommendedEvents, ...(randomEvents || [])];
      }

      // Deduplicate events
      const uniqueEvents = recommendedEvents.filter(
        (event, index, self) =>
          index === self.findIndex((t) => t.id === event.id),
      );

      return uniqueEvents;
    }
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

    const mappedGroupDto = {
      ...createGroupDto,
      slug: slugifiedName,
      categories: categoryEntities,
      createdBy: { id: userId },
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
    await this.groupMemberService.createGroupOwner({
      userId,
      groupId: savedGroup.id,
    });

    return savedGroup;
  }

  // Find all groups with relations
  async showAll(pagination: PaginationDto, query: QueryGroupDto): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const { page, limit } = pagination;
    const { search, userId, location, categories } = query;
    const groupQuery = this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.categories', 'categories')
      .leftJoinAndSelect('group.groupMembers', 'groupMembers')
      .leftJoinAndSelect('groupMembers.user', 'user')
      .leftJoinAndSelect('groupMembers.groupRole', 'groupRole')
      .where('group.status = :status', { status: GroupStatus.Published });

    if (userId) {
      groupQuery.andWhere('user.id = :userId', { userId });
    }

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

    if (location) {
      groupQuery.andWhere('group.location LIKE :location', {
        location: `%${location}%`,
      });
    }

    if (search) {
      groupQuery.andWhere(
        `(group.name LIKE :search OR 
          group.description LIKE :search OR 
          group.location LIKE :search OR 
          group.type LIKE :search OR 
          CAST(group.lat AS TEXT) LIKE :search OR 
          CAST(group.lon AS TEXT) LIKE :search)`,
        { search: `%${search}%` },
      );
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

  async showGroup(slug: string, userId?: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
      relations: ['createdBy', 'categories'],
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

    return group;
  }

  async showGroupAbout(slug: string): Promise<{
    events: EventEntity[];
    groupMembers: GroupMemberEntity[];
    messages: ZulipMessage[];
    topics: ZulipTopic[];
  }> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    group.events = await this.eventService.findEventsForGroup(group.id, 5);

    group.groupMembers = await this.groupMemberService.findGroupDetailsMembers(
      group.id,
      5,
    );

    if (group.zulipChannelId) {
      group.topics = await this.zulipService.getAdminStreamTopics(
        group.zulipChannelId,
      );
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
    const group = await this.groupRepository.findOneBy({ slug });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

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
    return this.groupRepository.save(updatedGroup);
  }

  async remove(slug: string): Promise<void> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOneBy({ slug });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // First, delete all group members associated with the group
    await this.groupMembersRepository.delete({ group: { id: group.id } });
    await this.eventService.deleteEventsByGroup(group.id);

    await this.groupRepository.remove(group);
  }

  async getHomePageFeaturedGroups(): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();

    return this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.groupMembers', 'groupMembers')
      .leftJoinAndSelect('group.categories', 'categories')
      .where({
        visibility: GroupVisibility.Public,
        status: GroupStatus.Published,
      })
      .orderBy('RANDOM()')
      .limit(5)
      .getMany(); // TODO: later provide featured flag or configuration object
  }

  async getHomePageUserCreatedGroups(
    userId: number,
    take: number = 0,
  ): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    return await this.groupRepository.find({
      where: { createdBy: { id: userId } },
      take,
      relations: ['createdBy', 'groupMembers'],
      order: { createdAt: 'DESC' },
    });
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
    const group = await this.groupRepository.findOne({
      where: { slug },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return await this.groupMemberService.approveMember(groupMemberId);
  }

  async rejectMember(slug: string, groupMemberId: number) {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return await this.groupMemberService.rejectMember(groupMemberId);
  }

  async joinGroup(slug: string, userId: number) {
    await this.getTenantSpecificGroupRepository();

    const groupEntity = await this.groupRepository.findOne({
      where: { slug },
      relations: ['createdBy'],
    });

    if (!groupEntity) {
      throw new NotFoundException('Group not found');
    }

    if (
      groupEntity?.requireApproval ||
      groupEntity?.visibility === GroupVisibility.Private
    ) {
      await this.groupMemberService.createGroupMember(
        { userId, groupId: groupEntity.id },
        GroupRole.Guest,
      );

      // TODO: uncomment this when we have a mail service
      // if (groupEntity.createdBy.email) {
      //   await this.mailService.groupMemberJoined({
      //     to: groupEntity.createdBy.email,
      //     data: {
      //       group: groupEntity,
      //       user: groupEntity.createdBy,
      //     },
      //   });
      // }
    } else {
      await this.groupMemberService.createGroupMember(
        { userId, groupId: groupEntity.id },
        GroupRole.Member,
      );
    }

    return await this.groupMemberService.findGroupMemberByUserId(
      groupEntity.id,
      userId,
    );
  }

  async leaveGroup(slug: string, userId: number) {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return await this.groupMemberService.leaveGroup(userId, group.id);
  }

  async removeGroupMember(slug: string, groupMemberId: number) {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
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
    const group = await this.groupRepository.findOne({
      where: { slug },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return await this.groupMemberService.updateGroupMemberRole(
      groupMemberId,
      updateDto,
    );
  }

  async showGroupMembers(slug: string): Promise<GroupMemberEntity[]> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return await this.groupMemberService.findGroupDetailsMembers(group.id, 0);
  }

  async showGroupEvents(slug: string): Promise<EventEntity[]> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { slug },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

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

    const topics = await this.zulipService.getAdminStreamTopics(
      group.zulipChannelId,
    );

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

    const group = await this.groupRepository.findOne({
      where: { slug },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const groupChannelName = `tenant_${this.request.tenantId}__group_${group.ulid}`;
    if (!group.zulipChannelId) {
      // create channel
      await this.zulipService.subscribeUserToChannel(user, {
        subscriptions: [
          {
            name: groupChannelName,
          },
        ],
      });
      const stream = await this.zulipService.getAdminStreamId(groupChannelName);
      // TODO remove default topic from channel
      // await this.zulipService.deleteAdminStreamTopic(
      //   stream.id,
      //   'channel events',
      // );
      group.zulipChannelId = stream.id;
      await this.groupRepository.save(group);
    }

    await this.zulipService.getInitialisedClient(user);

    const params = {
      to: group.zulipChannelId,
      type: 'channel' as const,
      topic: body.topicName,
      content: body.message,
    };

    return await this.zulipService.sendUserMessage(user, params);
  }

  async updateGroupDiscussionMessage(
    messageId: number,
    message: string,
    userId: number,
  ): Promise<{ id: number }> {
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return await this.zulipService.updateUserMessage(user, messageId, message);
    // return await this.zulipService.updateAdminMessage(messageId, message);
  }

  async deleteGroupDiscussionMessage(
    messageId: number,
  ): Promise<{ id: number }> {
    return await this.zulipService.deleteAdminMessage(messageId);
  }
}
