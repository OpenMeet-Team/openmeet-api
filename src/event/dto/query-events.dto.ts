import {
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  search: string;

  // @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => Number)
  userId: number;

  @ApiPropertyOptional({
    description: 'Filter events from this date.',
    example: '2024-10-11',
    type: String,
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  fromDate: string;

  @ApiPropertyOptional({
    description: 'Filter events to this date.',
    example: '2024-10-15',
    type: String,
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  toDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  location: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  radius?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  lon?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  type: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((item) => item.trim())
      : value,
  )
  categories: string[];

  // Recurring event query options
  @ApiPropertyOptional({
    description:
      'Whether to include recurring events in the results. Defaults to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  includeRecurring?: boolean = true;

  @ApiPropertyOptional({
    description:
      'Whether to expand recurring events into individual occurrences. Defaults to false.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  expandRecurring?: boolean = false;

  @ApiPropertyOptional({
    description:
      'Number of occurrences to expand for recurring events (used when expandRecurring is true).',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  occurrenceLimit?: number;

  @ApiPropertyOptional({
    description: 'The timezone to use for occurrence calculations.',
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiPropertyOptional({
    description: 'Filter by specific event ID',
    example: '12345',
  })
  @IsOptional()
  @Type(() => Number)
  eventId?: number;

  @ApiPropertyOptional({
    description: 'Filter by parent event ID (for recurring event occurrences)',
    example: '12345',
  })
  @IsOptional()
  @Type(() => Number)
  parentEventId?: number;
}
