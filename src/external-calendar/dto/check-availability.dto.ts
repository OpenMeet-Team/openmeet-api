import { IsArray, IsDateString, IsNotEmpty, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CheckAvailabilityDto {
  @ApiProperty({
    description: 'Start time for the availability check',
    example: '2024-01-15T10:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  @Type(() => Date)
  startTime: Date;

  @ApiProperty({
    description: 'End time for the availability check',
    example: '2024-01-15T11:00:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  @Type(() => Date)
  endTime: Date;

  @ApiProperty({
    description:
      'List of calendar source ULIDs to check (optional - if empty, checks all user calendars)',
    example: ['calendar_ulid_1', 'calendar_ulid_2'],
    required: false,
  })
  @IsArray()
  @IsOptional()
  calendarSourceIds?: string[];
}
