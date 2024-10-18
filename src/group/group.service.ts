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
import { Status } from '../core/constants/constant';
import { GroupMemberService } from '../group-member/group-member.service';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { paginate } from '../utils/generic-pagination';
import { QueryGroupDto } from './dto/group-query.dto';
import slugify from 'slugify';

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
      relations: ['groupMembers', 'groupMembers.user'],
    });
    return groups;
  }

  async getGroupsByMember(userId: string): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    const groups = await this.groupRepository.find({
      where: {
        groupMembers: { user: { id: Number(userId) } },
      },
      relations: ['groupMembers', 'groupMembers.user'],
    });
    return groups;
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
    const groupMemberDto = {
      requiredApproval: false,
      userId,
      groupId: savedGroup.id,
    };
    await this.groupMemberService.createGroupMember(groupMemberDto);

    return savedGroup;
  }

  // Find all groups with relations
  async findAll(pagination: PaginationDto, query: QueryGroupDto): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const { page, limit } = pagination;
    const { search, userId, location, categories } = query;
    console.log('🚀 ~ GroupService ~ findAll ~ categories:', categories);
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

  async findOne(id: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { id },
      relations: [
        'events',
        'groupMembers',
        'groupMembers.user',
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

  async findGroupEvent(id: number): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    const groupQuery = this.groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.events', 'events')
      .where('group.id = :id', { id })
      .andWhere('events.status = :status', { status: Status.Published })
      .getOne();

    return groupQuery;
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

    await this.groupRepository.remove(group);
  }
}
