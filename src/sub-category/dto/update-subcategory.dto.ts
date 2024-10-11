import { PartialType } from '@nestjs/swagger';
import { CreateSubCategoryDto } from './create-subcategory.dto';

export class UpdateSubCategoryDto extends PartialType(CreateSubCategoryDto) {}
