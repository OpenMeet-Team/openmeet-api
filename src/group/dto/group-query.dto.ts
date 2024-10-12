import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryGroupDto {
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
}
