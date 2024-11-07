import { PartialType } from '@nestjs/swagger';
import { CreateEventAttendeeDto } from './create-eventAttendee.dto';

export class UpdateEventAttendeeDto extends PartialType(
  CreateEventAttendeeDto,
) {}
