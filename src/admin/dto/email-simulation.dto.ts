import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';

export enum EmailSimulationType {
  SIGNUP = 'signup',
  PASSWORD_RESET = 'password_reset',
  EMAIL_CHANGE = 'email_change',
  CHAT_NEW_MESSAGE = 'chat_new_message',
  GROUP_MEMBER_ROLE_UPDATED = 'group_member_role_updated',
  GROUP_GUEST_JOINED = 'group_guest_joined',
  EVENT_ATTENDEE_GUEST_JOINED = 'event_attendee_guest_joined',
  EVENT_ATTENDEE_STATUS_CHANGED = 'event_attendee_status_changed',
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
