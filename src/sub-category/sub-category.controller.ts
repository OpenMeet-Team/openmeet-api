import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CreateSubCategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';
import { SubCategoryEntity } from './infrastructure/persistence/relational/entities/sub-category.entity';
import { SubCategoryService } from './sub-category.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('SubCategories')
@Controller('subcategories')
export class SubCategoryController {
  constructor(private readonly subCategoryService: SubCategoryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new subcategory' })
  async create(
    @Body() createSubCategoryDto: CreateSubCategoryDto,
  ): Promise<SubCategoryEntity> {
    return this.subCategoryService.create(createSubCategoryDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all subcategories' })
  async findAll(): Promise<SubCategoryEntity[]> {
    return this.subCategoryService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subcategory by ID' })
  async findOne(@Param('id') id: number): Promise<SubCategoryEntity> {
    const subcategory = await this.subCategoryService.findOne(+id);
    if (!subcategory) {
      throw new NotFoundException(`SubCategory with ID ${id} not found`);
    }
    return subcategory;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subcategory by ID' })
  async update(
    @Param('id') id: number,
    @Body() updateSubCategoryDto: UpdateSubCategoryDto,
  ): Promise<SubCategoryEntity> {
    return this.subCategoryService.update(+id, updateSubCategoryDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a subcategory by ID' })
  async remove(@Param('id') id: number): Promise<void> {
    return this.subCategoryService.remove(+id);
  }
}
