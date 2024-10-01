import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupDto {
  @ApiProperty({
    description: 'The name of the category',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'The slug of the category',
  })
  @IsString()
  description: string;


  @ApiPropertyOptional({
    description: 'The list of events associated with this category',
    type: [Number]
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  categories?: number[];
}
