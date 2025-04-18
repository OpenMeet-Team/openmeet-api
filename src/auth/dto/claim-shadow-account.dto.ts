import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { AuthProvidersEnum } from '../auth-providers.enum';

/**
 * DTO for claiming a shadow account
 */
export class ClaimShadowAccountDto {
  @ApiProperty({
    description: 'User ID that will claim the shadow account',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  @ApiProperty({
    description: 'External ID (e.g., DID for Bluesky)',
    example: 'did:plc:1234abcd',
  })
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty({
    description: 'Authentication provider',
    enum: AuthProvidersEnum,
    example: 'bluesky',
  })
  @IsEnum(AuthProvidersEnum)
  @IsNotEmpty()
  provider: AuthProvidersEnum;
}
