import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateEventAttendeeDto } from './create-eventAttendee.dto';

export class UpdateEventAttendeeDto extends PartialType(
  OmitType(CreateEventAttendeeDto, ['eventId'] as const),
) {}
