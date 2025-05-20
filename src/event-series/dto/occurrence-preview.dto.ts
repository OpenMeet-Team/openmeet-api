import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, ValidateNested, IsEnum, IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { RecurrenceFrequency, RecurrenceRule } from '../interfaces/recurrence.interface';

/**
 * DTO for RecurrenceRule to ensure proper deserialization
 */
export class RecurrenceRuleDto implements RecurrenceRule {
  @ApiProperty({
    description: 'The frequency of recurrence (DAILY, WEEKLY, MONTHLY, YEARLY)',
    enum: RecurrenceFrequency,
    example: 'WEEKLY',
  })
  @IsEnum(RecurrenceFrequency)
  @IsNotEmpty()
  frequency: RecurrenceFrequency;

  @ApiProperty({
    description: 'How often the event repeats (e.g., every 2 weeks)',
    example: 1,
    required: false,
  })
  @IsInt()
  @IsOptional()
  interval?: number;

  @ApiProperty({
    description: 'Number of occurrences in the series',
    example: 10,
    required: false,
  })
  @IsInt()
  @IsOptional()
  count?: number;

  @ApiProperty({
    description: 'End date for the recurrence',
    example: '2025-12-31T23:59:59.999Z',
    required: false,
  })
  @IsString()
  @IsOptional()
  until?: string;

  @ApiProperty({
    description: "Days of the week ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')",
    example: ['MO', 'WE', 'FR'],
    type: [String],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  byweekday?: string[];

  @ApiProperty({
    description: 'Days of the month (1-31 or -31 to -1 for counting from the end)',
    example: [1, 15],
    type: [Number],
    required: false,
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  bymonthday?: number[];

  @ApiProperty({
    description: 'Months of the year (1-12)',
    example: [1, 6, 12],
    type: [Number],
    required: false,
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  bymonth?: number[];

  @ApiProperty({
    description: 'Positions within a month/year (e.g., 1 for first, 2 for second, -1 for last)',
    example: [1],
    type: [Number],
    required: false,
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  bysetpos?: number[];
}

/**
 * DTO for requesting occurrence previews based on a recurrence pattern
 */
export class OccurrencePreviewDto {
  @ApiProperty({
    description: 'The start date for the occurrences in ISO format',
    example: '2025-06-15T09:00:00.000Z',
  })
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    description: 'The timezone for the occurrences',
    example: 'America/New_York',
  })
  @IsString()
  @IsNotEmpty()
  timeZone: string;

  @ApiProperty({
    description: 'The recurrence rule to use for generating occurrences',
    type: RecurrenceRuleDto,
  })
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrenceRule: RecurrenceRuleDto;

  @ApiProperty({
    description: 'The maximum number of occurrences to generate',
    example: 5,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  count?: number;
}