import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../core/constants/constant';

export class QueryEventAttendeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  search: string;

  // @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  userId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  role: EventAttendeeRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Type(() => String)
  status: EventAttendeeStatus;
}
