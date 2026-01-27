import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OAuthPlatform } from '../../auth/types/oauth.types';

export class LinkAtprotoDto {
  @ApiProperty({
    description: 'AT Protocol handle to link',
    example: 'alice.bsky.social',
  })
  @IsString()
  handle: string;

  @ApiPropertyOptional({ description: 'Client platform for redirect' })
  @IsOptional()
  @IsString()
  platform?: OAuthPlatform;
}
