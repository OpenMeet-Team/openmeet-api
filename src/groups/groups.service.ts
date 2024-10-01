import { Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CategoryService } from '../categories/categories.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupService {
  private groupRepository: Repository<GroupEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService
  ) {}

  async getTenantSpecificGroupRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.groupRepository = dataSource.getRepository(GroupEntity);
  }

  async create(createGroupDto: CreateGroupDto): Promise<any> {
    await this.getTenantSpecificGroupRepository();
    let categoryEntities: any[] = [];
    const categoryIds = createGroupDto.categories;

    if (categoryIds && categoryIds.length > 0) {
      categoryEntities = await Promise.all(
        categoryIds.map(async (categoryId) => {
          const categoryEntity = await this.categoryService.findOne(categoryId);
          if (!categoryEntity) {
            throw new NotFoundException(`Category with ID ${categoryId} not found`);
          }
          return categoryEntity;
        })
      );
    }    

    const mappedGroupDto = {
      ...createGroupDto,
      categories: categoryEntities,
    };

    const group = this.groupRepository.create(mappedGroupDto);
    return this.groupRepository.save(group);
  }

  // Find all groups with relations
  async findAll(): Promise<GroupEntity[]> {
    await this.getTenantSpecificGroupRepository();
    return this.groupRepository.find({
      relations: ['categories'],
    });
  }

  async findOne(id: number): Promise<GroupEntity> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.groupRepository.findOne({
      where: { id },
      relations: ['categories'],
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    return group;
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
            throw new NotFoundException(`Category with ID ${categoryId} not found`);
          }
          return categoryEntity;
        })
      );
    }

    const mappedGroupDto = {
      ...updateGroupDto,
      categories: categoryEntities,
    };

    const updatedGroup = this.groupRepository.merge(group, mappedGroupDto);
    return this.groupRepository.save(updatedGroup);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificGroupRepository();
    const group = await this.findOne(id);
    await this.groupRepository.remove(group);
  }
}
