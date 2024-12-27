import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AuthBlueskyAuthorizeDto {
  @ApiProperty({
    example: 'user.bsky.social',
    description: 'The Bluesky handle',
  })
  @IsString()
  @IsNotEmpty()
  handle: string;

  @ApiProperty({
    example: 'tenant123',
    description: 'The tenant ID',
  })
  @IsString()
  @IsNotEmpty()
  tenantId: string;
}
