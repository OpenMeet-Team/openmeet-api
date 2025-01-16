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
import { Trace } from '../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

@ApiTags('Categories')
@Controller('categories')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class CategoryController {
  private readonly tracer = trace.getTracer('category-controller');

  constructor(private readonly categoryService: CategoryService) {}

  @Permissions({
    context: 'user',
    permissions: [UserPermission.CreateCategories],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new category' })
  @Trace('category.controller.create')
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryEntity> {
    return this.categoryService.create(createCategoryDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all categories' })
  @Trace('category.controller.findAll')
  async findAll(): Promise<CategoryEntity[]> {
    return await this.tracer.startActiveSpan(
      'category.controller.findAll',
      async (span) => {
        try {
          span.setAttribute('operation', 'findAll');
          const startTime = Date.now();

          const result = await this.categoryService.findAll();

          span.setAttribute('categories.count', result.length);
          span.setAttribute('duration_ms', Date.now() - startTime);
          return result;
        } finally {
          span.end();
        }
      },
    );
  }

  @Public()
  @UseGuards(JWTAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  @Trace('category.controller.findOne')
  async findOne(@Param('id') id: number): Promise<CategoryEntity> {
    return await this.tracer.startActiveSpan(
      'category.controller.findOne',
      async (span) => {
        try {
          span.setAttribute('category.id', id);
          const category = await this.categoryService.findOne(+id);
          if (!category) {
            span.setAttribute('error', true);
            span.setAttribute('error.type', 'NotFound');
            throw new NotFoundException(`Category with ID ${id} not found`);
          }
          return category;
        } finally {
          span.end();
        }
      },
    );
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.ManageCategories],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a category by ID' })
  @Trace('category.controller.update')
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
  @Trace('category.controller.remove')
  async remove(@Param('id') id: number): Promise<void> {
    return this.categoryService.remove(+id);
  }
}
