import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsISO8601,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OccurrencesQueryDto {
  @ApiProperty({
    description: 'Start date for the range (ISO string)',
    example: '2023-08-01T00:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsISO8601()
  startDate?: string;

  @ApiProperty({
    description: 'End date for the range (ISO string)',
    example: '2023-09-01T00:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsISO8601()
  endDate?: string;

  @ApiProperty({
    description: 'Maximum number of occurrences to return',
    example: 10,
    required: false,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  count?: number;

  @ApiProperty({
    description: 'Whether to include excluded dates in the result',
    example: false,
    required: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  includeExcluded?: boolean;
}
