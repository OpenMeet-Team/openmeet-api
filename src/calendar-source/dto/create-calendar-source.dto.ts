import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsDate,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CalendarSourceType {
  GOOGLE = 'google',
  APPLE = 'apple',
  OUTLOOK = 'outlook',
  ICAL = 'ical',
}

export class CreateCalendarSourceDto {
  @IsEnum(CalendarSourceType)
  @IsNotEmpty()
  type: CalendarSourceType;

  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateIf((o) => o.type === CalendarSourceType.ICAL)
  @IsUrl()
  @IsNotEmpty()
  url?: string;

  @ValidateIf((o) => o.type !== CalendarSourceType.ICAL)
  @IsString()
  @IsNotEmpty()
  accessToken?: string;

  @ValidateIf((o) => o.type !== CalendarSourceType.ICAL)
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ValidateIf((o) => o.type !== CalendarSourceType.ICAL)
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  expiresAt?: Date;

  @IsOptional()
  isPrivate?: boolean = false;

  @IsOptional()
  syncFrequency?: number = 60; // minutes
}
