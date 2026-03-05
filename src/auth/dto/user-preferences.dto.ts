import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyticsPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  optOut?: boolean;
}

export class NotificationPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

export class UserPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => AnalyticsPreferencesDto)
  analytics?: AnalyticsPreferencesDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  notifications?: NotificationPreferencesDto;
}
