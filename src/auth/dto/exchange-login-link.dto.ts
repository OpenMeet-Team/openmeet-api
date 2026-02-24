import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ExchangeLoginLinkDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    type: String,
    description: 'The 64-character hex code from the login link URL',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'code must be a 64-character hex string',
  })
  code: string;
}
