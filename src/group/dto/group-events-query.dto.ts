import { IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GroupEventsQueryDto {
  @ApiPropertyOptional({
    description: 'Start date filter (ISO 8601). Omit for no lower bound.',
    example: '2026-03-01',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO 8601). Omit for no upper bound.',
    example: '2026-03-31',
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  endDate?: string;
}
