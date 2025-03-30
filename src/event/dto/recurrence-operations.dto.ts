import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum RecurrenceModificationType {
  SINGLE = 'single',
  ALL = 'all',
  FUTURE = 'future',
}

export class ExcludeDateDto {
  @ApiProperty({
    description: 'The date to exclude from the recurrence pattern',
    example: '2024-12-25T09:00:00Z',
  })
  @IsNotEmpty()
  @IsDateString()
  date: string;
}

export class IncludeDateDto {
  @ApiProperty({
    description: 'The date to include in the recurrence pattern',
    example: '2024-12-25T09:00:00Z',
  })
  @IsNotEmpty()
  @IsDateString()
  date: string;
}

export class RecurrenceModificationTypeDto {
  @ApiProperty({
    description: 'Type of modification to apply to recurring events',
    enum: RecurrenceModificationType,
    example: RecurrenceModificationType.SINGLE,
  })
  @IsNotEmpty()
  @IsEnum(RecurrenceModificationType)
  modificationType: RecurrenceModificationType;

  @ApiPropertyOptional({
    description: 'The specific occurrence date (required for SINGLE and FUTURE modifications)',
    example: '2024-10-15T09:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  occurrenceDate?: string;
}

export class GetOccurrencesDto {
  @ApiPropertyOptional({
    description: 'Start date for the range of occurrences to return',
    example: '2024-10-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for the range of occurrences to return',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of occurrences to return',
    example: 10,
  })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Whether to include modified occurrences',
    example: true,
  })
  @IsOptional()
  @IsString()
  includeModified?: string;

  @ApiPropertyOptional({
    description: 'Format to return occurrences in (dates or full)',
    example: 'full',
  })
  @IsOptional()
  @IsString()
  @IsIn(['dates', 'full'])
  format?: 'dates' | 'full';
}