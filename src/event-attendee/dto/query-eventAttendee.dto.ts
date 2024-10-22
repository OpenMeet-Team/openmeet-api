import { IsOptional, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryEventAttendeeDto {
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
    type: String,
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  fromDate: string;

  @ApiPropertyOptional({
    description: 'Filter events to this date.',
    type: String,
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  toDate: string;
}
