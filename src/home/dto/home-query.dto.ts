import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class HomeQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  search: string;
}
