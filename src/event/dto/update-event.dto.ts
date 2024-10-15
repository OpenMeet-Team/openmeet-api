import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';

export class UpdateEventDto extends PartialType(
  OmitType(CreateEventDto, ['slug'] as const),
) {}
