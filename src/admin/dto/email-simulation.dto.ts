import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';

export enum EmailSimulationType {
  SIGNUP = 'signup',
  PASSWORD_RESET = 'password_reset',
  EMAIL_CHANGE = 'email_change',
}

export class EmailSimulationDto {
  @ApiProperty({
    description: 'Email address to send the simulation to',
    example: 'test@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Type of email to simulate',
    enum: EmailSimulationType,
    example: EmailSimulationType.SIGNUP,
  })
  @IsEnum(EmailSimulationType)
  emailType: EmailSimulationType;
}
