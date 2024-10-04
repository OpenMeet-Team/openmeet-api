import { Injectable, NotFoundException, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CreateSubCategoryDto } from './dto/create-subcategory.dto';
import { SubCategoryEntity } from './infrastructure/persistence/relational/entities/sub-categories.entity';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class SubCategoryService {
  private subCategoryRepository: Repository<SubCategoryEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async getTenantSpecificSubCategoryRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.subCategoryRepository = dataSource.getRepository(SubCategoryEntity);
  }

  async create(
    createSubCategoryDto: CreateSubCategoryDto,
  ): Promise<SubCategoryEntity> {
    await this.getTenantSpecificSubCategoryRepository();
    const category = { id: createSubCategoryDto.category };
    const mappedDto = {
      ...createSubCategoryDto,
      category,
    };
    const subCategory = this.subCategoryRepository.create(mappedDto);
    return this.subCategoryRepository.save(subCategory);
  }

  async findAll(): Promise<SubCategoryEntity[]> {
    await this.getTenantSpecificSubCategoryRepository();
    return this.subCategoryRepository.find({
      relations: ['category', 'users'],
    });
  }

  async findOne(id: number): Promise<SubCategoryEntity> {
    await this.getTenantSpecificSubCategoryRepository();
    const subCategory = await this.subCategoryRepository.findOne({
      where: { id },
      relations: ['category', 'users'],
    });

    if (!subCategory) {
      throw new NotFoundException(`SubCategory with ID ${id} not found`);
    }

    return subCategory;
  }

  async update(
    id: number,
    updateSubCategoryDto: UpdateSubCategoryDto,
  ): Promise<SubCategoryEntity> {
    await this.getTenantSpecificSubCategoryRepository();
    const subCategory = await this.findOne(id);
    const category = { id: updateSubCategoryDto.category };
    const mappedDto = {
      ...updateSubCategoryDto,
      category,
    };
    const updatedSubCategory = this.subCategoryRepository.merge(
      subCategory,
      mappedDto,
    );

    return this.subCategoryRepository.save(updatedSubCategory);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificSubCategoryRepository();
    const subCategory = await this.findOne(id);
    await this.subCategoryRepository.remove(subCategory);
  }
}
