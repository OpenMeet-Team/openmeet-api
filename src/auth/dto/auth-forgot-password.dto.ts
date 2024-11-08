import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class AuthForgotPasswordDto {
  @ApiProperty({ example: 'test1@openmeet.net', type: String })
  @Transform(lowerCaseTransformer)
  @IsEmail()
  email: string;
}
