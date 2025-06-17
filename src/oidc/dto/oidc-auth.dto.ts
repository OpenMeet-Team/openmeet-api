import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OidcAuthorizationDto {
  @ApiProperty({
    description: 'OIDC client identifier',
    example: 'matrix_synapse',
  })
  @IsString()
  @IsNotEmpty()
  client_id: string;

  @ApiProperty({
    description: 'Redirect URI for authorization response',
    example: 'https://matrix.openmeet.net/_synapse/client/oidc/callback',
  })
  @IsString()
  @IsNotEmpty()
  redirect_uri: string;

  @ApiProperty({
    description: 'OIDC response type',
    example: 'code',
  })
  @IsString()
  @IsIn(['code'])
  response_type: string;

  @ApiProperty({
    description: 'OIDC scopes',
    example: 'openid profile email',
  })
  @IsString()
  @IsNotEmpty()
  scope: string;

  @ApiProperty({
    description: 'State parameter for CSRF protection',
    required: false,
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({
    description: 'Nonce for ID token validation',
    required: false,
  })
  @IsString()
  @IsOptional()
  nonce?: string;
}

export class OidcTokenDto {
  @ApiProperty({
    description: 'Grant type',
    example: 'authorization_code',
  })
  @IsString()
  @IsIn(['authorization_code', 'refresh_token'])
  grant_type: string;

  @ApiProperty({
    description: 'Authorization code from auth endpoint',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'Redirect URI (must match auth request)',
  })
  @IsString()
  @IsNotEmpty()
  redirect_uri: string;

  @ApiProperty({
    description: 'OIDC client identifier',
  })
  @IsString()
  @IsNotEmpty()
  client_id: string;

  @ApiProperty({
    description: 'OIDC client secret',
  })
  @IsString()
  @IsNotEmpty()
  client_secret: string;
}
