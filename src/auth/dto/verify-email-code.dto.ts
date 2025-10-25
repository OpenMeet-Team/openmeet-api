import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailCodeDto {
  @ApiProperty({
    example: 'abc123def456789',
    type: String,
    description: 'Verification code from email',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
