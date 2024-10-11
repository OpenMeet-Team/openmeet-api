import { IsOptional, IsString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryEventDto {
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
    example: '2024-10-11',
    type: String, 
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  fromDate: string; 

  @ApiPropertyOptional({
    description: 'Filter events to this date.',
    example: '2024-10-15',
    type: String, 
  })
  @IsOptional()
  @IsDateString()
  @Type(() => String)
  toDate: string; 
}
