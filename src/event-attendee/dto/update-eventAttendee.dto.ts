import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../core/constants/constant';
import { EventSourceType } from '../../core/constants/source-type.constant';

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

  // Source fields
  @ApiPropertyOptional({
    description: 'The type of the source for this attendee (e.g. BLUESKY)',
    enum: EventSourceType,
  })
  sourceType?: EventSourceType;

  @ApiPropertyOptional({
    description:
      'The unique identifier for the external source of this attendance',
  })
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'URL to the external source',
  })
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: 'Additional data from the source',
    type: 'object',
  })
  sourceData?: Record<string, unknown>;
}
