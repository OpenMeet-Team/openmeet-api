import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { RecurrenceRule } from '../interfaces/recurrence.interface';

export class CreateSeriesFromEventDto {
  @ApiProperty({
    description: 'The recurrence rule for the new series',
    example: {
      frequency: 'WEEKLY',
      interval: 1,
      byweekday: ['MO', 'WE'],
      count: 10,
    },
  })
  @IsNotEmpty()
  @IsObject()
  recurrenceRule: RecurrenceRule;

  @ApiProperty({
    description:
      'Optional name for the new event series. Defaults to the original event name.',
    example: 'Weekly Standup Series',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description:
      'Optional description for the new event series. Defaults to the original event description.',
    example: 'Our regular weekly team standup meeting series.',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description:
      'Optional timezone for the series (defaults to event timezone or UTC)',
    required: false,
  })
  @IsOptional()
  @IsString()
  timeZone?: string;
}
