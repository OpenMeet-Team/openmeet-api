import { Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryEntity } from './infrastructure/persistence/relational/entities/categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class CategoryService {
  private categoryRepository: Repository<CategoryEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async getTenantSpecificCategoryRepository() {
    console.log('this.request', this.request);
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.categoryRepository = dataSource.getRepository(CategoryEntity);
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<any> {
    await this.getTenantSpecificCategoryRepository();
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  async findAll(): Promise<CategoryEntity[]> {
    await this.getTenantSpecificCategoryRepository();
    return this.categoryRepository.find({
      relations: ['subCategories', 'events', 'groups'],
    });
  }

  async findByIds(ids: number[]): Promise<CategoryEntity[]> {
    await this.getTenantSpecificCategoryRepository();
    return this.categoryRepository.find({
      where: {
        id: In(ids),
      },
    });
  }

  async findOne(id: number): Promise<CategoryEntity> {
    await this.getTenantSpecificCategoryRepository();
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['subCategories', 'events', 'groups'],
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  async update(
    id: number,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryEntity | void> {
    console.log('TODO, fix this id, updateCategoryDto', id, updateCategoryDto);
    await this.getTenantSpecificCategoryRepository();
    // const category = await this.findOne(id);
    // return this.categoryRepository.save(updatedCategory);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificCategoryRepository();
    const category = await this.findOne(id);
    await this.categoryRepository.remove(category);
  }

  async getHomeFeaturedCategories(): Promise<CategoryEntity[]> {
    await this.getTenantSpecificCategoryRepository();

    return this.categoryRepository
      .createQueryBuilder('category')
      .orderBy('RANDOM()')
      .take(5)
      .getMany();
  }
}
