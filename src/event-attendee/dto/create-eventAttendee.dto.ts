import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../core/constants/constant';

export class CreateEventAttendeeDto {
  @ApiPropertyOptional({
    description: 'The status of the Event Attendee',
    enum: EventAttendeeStatus,
  })
  @IsOptional()
  @IsEnum(EventAttendeeStatus)
  status?: EventAttendeeStatus;

  @ApiPropertyOptional({
    description: 'The role of the Event Attendee',
    enum: EventAttendeeRole,
  })
  @IsOptional()
  @IsEnum(EventAttendeeRole)
  role?: EventAttendeeRole;
}
