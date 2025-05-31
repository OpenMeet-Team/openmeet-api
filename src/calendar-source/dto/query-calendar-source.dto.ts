import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

import { CalendarSourceType } from '../enums/calendar-source-type.enum';

export class QueryCalendarSourceDto {
  @ApiPropertyOptional({
    enum: CalendarSourceType,
    description: 'Filter by calendar source type',
  })
  @IsOptional()
  @IsEnum(CalendarSourceType)
  type?: CalendarSourceType;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;
}
