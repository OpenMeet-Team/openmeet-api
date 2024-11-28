import { IsArray, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  search: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  location: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  radius?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  lon?: number;

  // @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => Number)
  userId: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((item) => item.trim())
      : value,
  )
  categories: string[];
}
