import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class AuthGoogleOAuth2Dto {
  @ApiProperty({
    example: 'abc123def456',
    description: 'Authorization code received from Google OAuth2 redirect'
  })
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'https://yourapp.com/auth/google/callback',
    description: 'Redirect URI used in the OAuth2 flow'
  })
  @IsNotEmpty()
  @IsUrl()
  redirectUri: string;

  @ApiProperty({
    example: 'xyz789',
    description: 'State parameter for CSRF protection',
    required: false
  })
  @IsOptional()
  state?: string;
}