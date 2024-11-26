import { GroupStatus, GroupVisibility } from './../../core/constants/constant';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FileEntity } from '../../file/infrastructure/persistence/relational/entities/file.entity';

export class CreateGroupDto {
  @ApiProperty({
    description: 'The name of the group',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'The image of the group',
    type: () => FileEntity,
  })
  @IsOptional()
  image?: FileEntity;

  // @ApiProperty({
  //   description: 'The slug of the group',
  // })
  // @IsString()
  // @IsOptional()
  // slug?: string;

  @ApiProperty({
    description: 'The description of the group',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'The location of the group',
  })
  @IsOptional()
  @IsString()
  location: string;

  @ApiProperty({
    description: 'The latitude of the group location',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat: number;

  @ApiProperty({
    description: 'The longitude of the group location',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lon: number;

  @ApiPropertyOptional({
    description: 'Whether the group requires approval for new members',
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  requireApproval: boolean;

  @ApiPropertyOptional({
    description: 'The status of the group',
    enum: GroupStatus,
  })
  @IsOptional()
  @IsEnum(GroupStatus)
  status?: GroupStatus;

  @ApiPropertyOptional({
    description: 'The visibility of the group',
    enum: GroupVisibility,
  })
  @IsOptional()
  @IsEnum(GroupVisibility)
  visibility?: GroupVisibility;

  @ApiPropertyOptional({
    description: 'The list of category IDs associated with this group',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  categories?: number[];
}
