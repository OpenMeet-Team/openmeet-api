import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../core/constants/constant';

export class UpdateEventAttendeeDto {
  @ApiProperty({
    description: 'The role of the Event Attendee',
    enum: EventAttendeeRole,
  })
  role: EventAttendeeRole;

  @ApiProperty({
    description: 'The status of the Event Attendee',
    enum: EventAttendeeStatus,
  })
  status: EventAttendeeStatus;
  
  @ApiPropertyOptional({
    description: 'Optional metadata for the attendance record',
    type: 'object',
  })
  metadata?: Record<string, any>;
}
