import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsDateString,
  IsString,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class DIDEventsQueryDto {
  @ApiPropertyOptional({
    description: 'Events starting after this date (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Events starting before this date (ISO 8601)',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Filter to events in a specific group',
  })
  @IsOptional()
  @IsString()
  groupSlug?: string;

  @ApiPropertyOptional({
    description: 'Include public events the user is attending (default: false)',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includePublic?: boolean;

  @ApiPropertyOptional({
    description: 'Page size (max 100)',
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Pagination cursor',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
