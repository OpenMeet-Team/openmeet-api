import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Status } from '../../core/constants/constant';

export class CreateGroupDto {
  @ApiProperty({
    description: 'The name of the group',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'The slug of the group',
  })
  @IsString()
  @IsOptional()
  slug: string;

  @ApiProperty({
    description: 'The description of the group',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Whether the group is approved or not',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @ApiPropertyOptional({
    description: 'The status of the group',
    enum: Status,
  })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @ApiPropertyOptional({
    description: 'The list of category IDs associated with this group',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  categories?: number[];
}
