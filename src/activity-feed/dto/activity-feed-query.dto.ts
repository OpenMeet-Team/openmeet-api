import { IsOptional, IsNumber, IsArray, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ActivityFeedQueryDto {
  @ApiPropertyOptional({
    description: 'Number of activities to return',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of activities to skip (for pagination)',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offset?: number;

  @ApiPropertyOptional({
    description: 'Visibility levels to include',
    type: [String],
    example: ['public', 'authenticated', 'members_only'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((item) => item.trim())
      : value,
  )
  visibility?: string[];
}
