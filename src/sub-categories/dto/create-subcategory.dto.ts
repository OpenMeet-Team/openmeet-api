import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { SubCategoryType } from '../../core/constants/constant';

export class CreateSubCategoryDto {
  @ApiProperty({
    description: 'The title of the group',
  })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({
    description: 'The description of the group',
  })
  @IsString()
  description: string;

  @ApiPropertyOptional({
    description: 'The type of the sub-category',
    enum: SubCategoryType,
  })
  @IsOptional()
  @IsEnum(SubCategoryType)
  type: SubCategoryType;

  @ApiPropertyOptional({
    description: 'The category associated with the group',
  })
  @IsOptional()
  @Type(() => Number)
  category: number;
}
