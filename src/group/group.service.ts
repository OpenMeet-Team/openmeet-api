import { Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CategoryService } from '../category/category.service';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupUserPermissionEntity } from './infrastructure/persistence/relational/entities/group-user-permission.entity';
import { Status, Visibility } from '../core/constants/constant';
import { GroupMemberService } from '../group-member/group-member.service';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { paginate } from '../utils/generic-pagination';
import { QueryGroupDto } from './dto/group-query.dto';
import slugify from 'slugify';
import { EventService } from '../event/event.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupService {
  private groupMembersRepository: Repository<GroupMemberEntity>;
  private groupRepository: Repository<GroupEntity>;
  private eventRepository: Repository<EventEntity>;
  private readonly groupMemberPermissionsRepository: Repository<GroupUserPermissionEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
    private readonly groupMemberService: GroupMemberService,
    private readonly eventService: EventService,
  ) {}

  async getTenantSpecificGroupRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.groupRepository = dataSource.getRepository(GroupEntity);
    this.groupMembersRepository = dataSource.getRepository(GroupMemberEntity);
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

  async getGroupsByCreator(userId: string): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    // find where groupMembers user id == userid
    const groups = await this.groupRepository.find({
      where: {
        groupMembers: { user: { id: Number(userId) } },
      },
      relations: ['createdBy'],
    });
    return groups;
  }

  async getGroupsByMember(userId: string): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    const groups = await this.groupRepository.find({
      where: {
        groupMembers: { user: { id: Number(userId) } },
      },
      relations: ['createdBy'],
    });
    return groups;
  }

  // Get recommended events for a group, suppliment with random events if not enough
  async getRecommendedEvents(
    groupId: number,
    minEvents: number = 3,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    await this.getTenantSpecificGroupRepository();

    const group = await this.groupRepository.findOne({
      where: { id: Number(groupId) },
      relations: ['categories'],
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    const categoryIds = group.categories.map((c) => c.id);

    let recommendedEvents: EventEntity[] = [];
    try {
      recommendedEvents =
        (await this.eventService.findRecommendedEventsForGroup(
          groupId,
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
          groupId,
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

    if (uniqueEvents.length < minEvents) {
      throw new NotFoundException(
        `Not enough events found for group ${groupId}`,
      );
    }

    if (uniqueEvents.length > maxEvents) {
      return uniqueEvents.slice(0, maxEvents);
    }

    return uniqueEvents;
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

    const slugifiedName = slugify(createGroupDto.name, {
      strict: true,
      lower: true,
    });

    const mappedGroupDto = {
      ...createGroupDto,
      slug: slugifiedName,
      categories: categoryEntities,
      createdBy: { id: userId },
    };

    const group = this.groupRepository.create(mappedGroupDto);
    const savedGroup = await this.groupRepository.save(group);
    await this.groupMemberService.createGroupOwner({
      userId,
      groupId: savedGroup.id,
    });

    return savedGroup;
  }

  // Find all groups with relations
  async findAll(pagination: PaginationDto, query: QueryGroupDto): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const { page, limit } = pagination;
    const { search, userId, location, categories } = query;
    const groupQuery = this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.categories', 'categories')
      .leftJoinAndSelect('group.groupMembers', 'groupMembers')
      .leftJoinAndSelect('groupMembers.user', 'user')
      .leftJoinAndSelect('groupMembers.groupRole', 'groupRole')
      .where('group.status = :status', { status: Status.Published });

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

    return paginate(groupQuery, { page, limit });
  }

  async findQuery(id: number, userId: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();

    const groupQuery = this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.events', 'events')
      .leftJoinAndSelect('group.groupMembers', 'groupMembers')
      .leftJoinAndSelect('groupMembers.user', 'user')
      .leftJoinAndSelect('group.createdBy', 'createdBy')
      .leftJoinAndSelect('group.categories', 'categories')
      .leftJoinAndSelect('groupMembers.groupRole', 'groupRole')
      .leftJoinAndSelect('groupRole.groupPermissions', 'groupPermissions')
      .where('group.id = :id', { id });

    const group = await groupQuery.getOne();

    if (!group) {
      throw new Error('Group not found');
    }

    // Slice the events and groupMembers lists to return only the first 5 entries
    group.events = group.events.slice(0, 5);
    group.groupMembers = group.groupMembers.slice(0, 5);

    return {
      ...group,
      groupMember: group.groupMembers.find(
        (member) => member.user.id === userId,
      ),
    };
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
      throw new Error('Group not found');
    }

    group.events = group.events.slice(0, 5);
    group.groupMembers = group.groupMembers.slice(0, 5);

    return group;
  }

  async findGroupDetails(id: number, userId?: number): Promise<any> {
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
      throw new Error('Group not found');
    }

    group.events = group.events.slice(0, 5);
    group.groupMembers = group.groupMembers.slice(0, 5);

    if (userId) {
      group.groupMember = await this.groupMemberService.findGroupMemberByUserId(
        group.id,
        userId,
      );
    }

    return group;
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

  async findGroupDetailsEvents(id: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    return await this.eventService.findGroupDetailsAttendees(id);
  }

  async findGroupDetailsMembers(id: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    return await this.groupMemberService.findGroupDetailsMembers(id);
  }

  async update(
    id: number,
    updateGroupDto: UpdateGroupDto,
  ): Promise<GroupEntity> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.findOne(id);

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

    let slugifiedName = '';

    if (updateGroupDto.name) {
      slugifiedName = slugify(updateGroupDto.name, {
        strict: true,
        lower: true,
      });
    }

    const mappedGroupDto = {
      ...updateGroupDto,
      slug: slugifiedName,
      categories: categoryEntities,
    };

    const updatedGroup = this.groupRepository.merge(group, mappedGroupDto);
    return this.groupRepository.save(updatedGroup);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.findOne(id);

    // First, delete all group members associated with the group
    await this.groupMembersRepository.delete({ group: { id } });
    await this.eventService.deleteEventsByGroup(id);

    await this.groupRepository.remove(group);
  }

  async getHomePageFeaturedGroups(): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();

    return this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.groupMembers', 'groupMembers')
      .leftJoinAndSelect('group.categories', 'categories')
      .where({ visibility: Visibility.Public, status: Status.Published })
      .orderBy('RANDOM()')
      .limit(5)
      .getMany(); // TODO: later provide featured flag or configuration object
  }

  async getHomePageUserCreatedGroups(
    userId: number,
    take: number = 0,
  ): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    return this.groupRepository.find({
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

    const { entities } = await this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.groupMembers', 'groupMembers')
      .leftJoinAndSelect('groupMembers.groupRole', 'groupRole')
      .innerJoin('group.groupMembers', 'member', 'member.userId = :userId', {
        userId,
      })
      .where('groupRole.name != :ownerRole', { ownerRole: 'owner' })
      .getRawAndEntities();

    return entities;
  }
}
