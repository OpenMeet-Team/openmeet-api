import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryService } from './category.service';
import { CategoryEntity } from './infrastructure/persistence/relational/entities/categories.entity';
import { JWTAuthGuard } from '../auth/auth.guard';
import { Permissions } from '../shared/guard/permissions.decorator';
import { UserPermission } from '../core/constants/constant';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Categories')
@Controller('categories')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Permissions({
    context: 'user',
    permissions: [UserPermission.CreateCategories],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new category' })
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryEntity> {
    return this.categoryService.create(createCategoryDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all categories' })
  async findAll(): Promise<CategoryEntity[]> {
    return this.categoryService.findAll();
  }

  @Permissions(UserPermission.ManageCategories)
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  async findOne(@Param('id') id: number): Promise<CategoryEntity> {
    const category = await this.categoryService.findOne(+id);
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.ManageCategories],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a category by ID' })
  async update(
    @Param('id') id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryEntity | void> {
    return this.categoryService.update(+id, updateCategoryDto);
  }

  @Permissions(UserPermission.DeleteCategories)
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a category by ID' })
  async remove(@Param('id') id: number): Promise<void> {
    return this.categoryService.remove(+id);
  }
}
