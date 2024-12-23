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
}
