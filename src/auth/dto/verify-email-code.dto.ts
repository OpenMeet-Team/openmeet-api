import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class VerifyEmailCodeDto {
  @ApiProperty({
    example: '123456',
    type: String,
    description: 'Verification code from email',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'user@example.com',
    type: String,
    description: 'Email address that received the verification code',
  })
  @Transform(lowerCaseTransformer)
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({
    example: 'account-merge',
    enum: ['login', 'account-merge'],
    description:
      'Context for verification: "login" for passwordless login, "account-merge" for merging Bluesky account with Quick RSVP account',
  })
  @IsOptional()
  @IsString()
  @IsIn(['login', 'account-merge'])
  context?: 'login' | 'account-merge';
}
