import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsArray } from 'class-validator';

export class GetEventsDto {
  @ApiProperty({
    description: 'Start time for the event query range',
    example: '2025-06-01T00:00:00Z',
  })
  @IsDateString()
  startTime: string;

  @ApiProperty({
    description: 'End time for the event query range',
    example: '2025-06-30T23:59:59Z',
  })
  @IsDateString()
  endTime: string;

  @ApiProperty({
    description: 'Optional array of calendar source ULIDs to filter by',
    example: ['01HK9QZXR8G7Q3N5M4P2T6F9X1'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  calendarSourceIds?: string[];
}
