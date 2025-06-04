import { IsString, IsOptional, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class RefreshTokenDto {
  @IsString()
  accessToken: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expiresAt?: Date;
}
