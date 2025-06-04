import { IsArray, IsDateString, IsNotEmpty, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetConflictsDto {
  @ApiProperty({
    description: 'Start time for the conflict search',
    example: '2024-01-15T09:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  @Type(() => Date)
  startTime: Date;

  @ApiProperty({
    description: 'End time for the conflict search',
    example: '2024-01-15T17:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  @Type(() => Date)
  endTime: Date;

  @ApiProperty({
    description:
      'List of calendar source ULIDs to search (optional - if empty, searches all user calendars)',
    example: ['calendar_ulid_1', 'calendar_ulid_2'],
    required: false,
  })
  @IsArray()
  @IsOptional()
  calendarSourceIds?: string[];
}
