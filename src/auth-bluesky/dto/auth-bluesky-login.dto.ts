import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AuthBlueskyLoginDto {
  @ApiProperty({
    example: 'abc123xyz',
    description: 'The OAuth authorization code',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'user.bsky.social',
    description: 'The Bluesky handle',
  })
  @IsString()
  @IsNotEmpty()
  handle: string;

  @ApiProperty({
    example: 'state123',
    description: 'The OAuth state for verification',
  })
  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  tenantId: string;
}
