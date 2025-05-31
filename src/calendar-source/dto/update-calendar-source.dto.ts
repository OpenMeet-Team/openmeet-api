import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateCalendarSourceDto } from './create-calendar-source.dto';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class UpdateCalendarSourceDto extends PartialType(
  OmitType(CreateCalendarSourceDto, [
    'type',
    'accessToken',
    'refreshToken',
    'expiresAt',
    'url',
  ]),
) {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(5) // Minimum 5 minutes
  @Max(1440) // Maximum 24 hours
  syncFrequency?: number;
}
