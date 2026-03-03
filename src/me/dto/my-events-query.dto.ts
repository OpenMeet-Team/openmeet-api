import { IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MyEventsQueryDto {
  @ApiPropertyOptional({
    description: 'Start date filter (ISO 8601). Defaults to today.',
    example: '2026-03-01',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO 8601). Defaults to startDate + 30 days.',
    example: '2026-03-31',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  endDate?: string;
}
