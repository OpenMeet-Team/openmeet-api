import { Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryEntity } from './infrastructure/persistence/relational/entities/categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Trace } from '../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class CategoryService {
  private categoryRepository: Repository<CategoryEntity>;
  private tracer = trace.getTracer('category-service');

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  @Trace('category.getTenantSpecificRepo')
  async getTenantSpecificCategoryRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.categoryRepository = dataSource.getRepository(CategoryEntity);
  }

  @Trace('category.create')
  async create(createCategoryDto: CreateCategoryDto): Promise<any> {
    await this.getTenantSpecificCategoryRepository();
    const category = this.categoryRepository.create(createCategoryDto);
    return this.categoryRepository.save(category);
  }

  @Trace('category.findAll')
  async findAll(loadRelations = false): Promise<CategoryEntity[]> {
    await this.getTenantSpecificCategoryRepository();
    return await this.tracer.startActiveSpan(
      'category.service.findAll',
      async (span) => {
        try {
          const querySpan = this.tracer.startSpan(
            'category.service.findAll.query',
          );

          // Only load relations if explicitly requested
          const relations = loadRelations
            ? ['subCategories', 'events', 'groups']
            : [];

          // Select only necessary fields for the filter
          const categories = await this.categoryRepository.find({
            select: ['id', 'name'],
            relations,
            cache: true,
          });

          querySpan.end();

          span.setAttribute('categories.count', categories.length);
          return categories;
        } catch (error) {
          span.setAttribute('error', true);
          span.setAttribute('error.message', error.message);
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  @Trace('categoryservice.findByIds')
  async findByIds(ids: number[]): Promise<CategoryEntity[]> {
    await this.getTenantSpecificCategoryRepository();
    return this.categoryRepository.find({
      where: {
        id: In(ids),
      },
    });
  }

  @Trace('categoryservice.findOne')
  async findOne(id: number): Promise<CategoryEntity | null> {
    await this.getTenantSpecificCategoryRepository();
    return await this.tracer.startActiveSpan(
      'category.service.findOne',
      async (span) => {
        try {
          span.setAttribute('category.id', id);
          const querySpan = this.tracer.startSpan(
            'category.service.findOne.query',
          );
          const category = await this.categoryRepository.findOne({
            where: { id },
            relations: ['subCategories', 'events', 'groups'],
          });
          querySpan.end();

          if (!category) {
            span.setAttribute('error', true);
            span.setAttribute('error.type', 'NotFound');
          }
          return category;
        } finally {
          span.end();
        }
      },
    );
  }

  @Trace('categoryservice.update')
  async update(
    id: number,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryEntity | void> {
    await this.getTenantSpecificCategoryRepository();
    const category = await this.findOne(id);
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return this.categoryRepository.save(updateCategoryDto);
  }

  @Trace('categoryservice.remove')
  async remove(id: number): Promise<void> {
    await this.getTenantSpecificCategoryRepository();
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    await this.categoryRepository.remove(category);
  }

  @Trace('categoryservice.getHomePageFeaturedCategories')
  async getHomePageFeaturedCategories(): Promise<CategoryEntity[]> {
    await this.getTenantSpecificCategoryRepository();

    return this.categoryRepository
      .createQueryBuilder('category')
      .orderBy('RANDOM()')
      .take(5)
      .getMany();
  }
}
