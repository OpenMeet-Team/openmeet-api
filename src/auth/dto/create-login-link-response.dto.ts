import { ApiProperty } from '@nestjs/swagger';

export class CreateLoginLinkResponseDto {
  @ApiProperty({
    example:
      'https://platform.openmeet.net/auth/token-login?code=abc123...&redirect=%2Fevents%2Fmy-event',
    description: 'Full URL to open in the browser to complete the login',
  })
  url: string;

  @ApiProperty({
    example: 60,
    description: 'Time in seconds until the login link expires',
  })
  expiresIn: number;
}
