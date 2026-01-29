import {
  IsString,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OAuthPlatform } from '../../auth/types/oauth.types';

export class LinkAtprotoDto {
  @ApiProperty({
    description: 'AT Protocol handle to link',
    example: 'alice.bsky.social',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(253) // DNS max length
  @Matches(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/,
    {
      message:
        'Handle must be a valid domain name format (e.g., alice.bsky.social)',
    },
  )
  handle: string;

  @ApiPropertyOptional({
    description: 'Client platform for redirect',
    enum: ['android', 'ios', 'web'],
  })
  @IsOptional()
  @IsIn(['android', 'ios', 'web'], {
    message: 'Platform must be one of: android, ios, web',
  })
  platform?: OAuthPlatform;
}
