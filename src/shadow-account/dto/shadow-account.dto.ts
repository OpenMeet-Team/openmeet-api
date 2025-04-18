import { ApiProperty } from '@nestjs/swagger';
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';
import {
  IsNotEmpty,
  IsEnum,
  IsString,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for returning shadow accounts in API responses
 */
export class ShadowAccountDto {
  @ApiProperty({ description: 'Shadow account ID' })
  id: number;

  @ApiProperty({ description: 'Shadow account ULID' })
  ulid: string;

  @ApiProperty({ description: 'Display name (username, handle, etc.)' })
  displayName: string;

  @ApiProperty({ description: 'External ID from the provider' })
  externalId: string;

  @ApiProperty({
    description: 'Authentication provider',
    enum: AuthProvidersEnum,
  })
  provider: AuthProvidersEnum;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({
    description: 'Provider-specific preferences',
    type: 'object',
    additionalProperties: true,
  })
  preferences: Record<string, any>;
}

/**
 * DTO for creating a shadow account
 */
export class CreateShadowAccountDto {
  @ApiProperty({ description: 'External ID from the provider' })
  @IsNotEmpty()
  @IsString()
  externalId: string;

  @ApiProperty({ description: 'Display name (username, handle, etc.)' })
  @IsNotEmpty()
  @IsString()
  displayName: string;

  @ApiProperty({
    description: 'Authentication provider',
    enum: AuthProvidersEnum,
  })
  @IsNotEmpty()
  @IsEnum(AuthProvidersEnum)
  provider: AuthProvidersEnum;

  @ApiProperty({
    description: 'Provider-specific preferences',
    type: 'object',
    additionalProperties: true,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  preferences?: Record<string, any>;
}
