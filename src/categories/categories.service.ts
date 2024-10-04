import { Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryEntity } from './infrastructure/persistence/relational/entities/categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { EventService } from '../events/events.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class CategoryService {
  private categoryRepository: Repository<CategoryEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly eventService: EventService,
  ) {}

  async getTenantSpecificCategoryRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.categoryRepository = dataSource.getRepository(CategoryEntity);
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<any> {
    await this.getTenantSpecificCategoryRepository();
    let eventEntities: any = [];
    const eventIds = createCategoryDto.events;
    if (eventIds && eventIds.length > 0) {
      eventEntities = await Promise.all(
        eventIds.map(async (eventId) => {
          const eventEntity = await this.eventService.findOne(eventId);
          if (!eventEntity) {
            throw new NotFoundException(`Event with ID ${eventId} not found`);
          }
          return eventEntity;
        }),
      );
    }
    const mappedCategoryDto = {
      ...createCategoryDto,
      events: eventEntities,
    };
    const category = this.categoryRepository.create(mappedCategoryDto);
    return this.categoryRepository.save(category);
  }

  async findAll(): Promise<CategoryEntity[]> {
    await this.getTenantSpecificCategoryRepository();
    return this.categoryRepository.find({
      relations: ['subCategories', 'events', 'groups'],
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
  ): Promise<CategoryEntity> {
    await this.getTenantSpecificCategoryRepository();
    const category = await this.findOne(id);

    let eventEntities: any[] = [];
    const eventIds = updateCategoryDto.events;
    if (eventIds && eventIds.length > 0) {
      eventEntities = await Promise.all(
        eventIds.map(async (eventId) => {
          const eventEntity = await this.eventService.findOne(eventId);
          if (!eventEntity) {
            throw new NotFoundException(`Event with ID ${eventId} not found`);
          }
          return eventEntity;
        }),
      );
    }

    const mappedCategoryDto = {
      ...updateCategoryDto,
      events: eventEntities,
    };

    const updatedCategory = this.categoryRepository.merge(
      category,
      mappedCategoryDto,
    );
    return this.categoryRepository.save(updatedCategory);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificCategoryRepository();
    const category = await this.findOne(id);
    await this.categoryRepository.remove(category);
  }
}
