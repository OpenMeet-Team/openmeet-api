import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateGroupDto } from './create-group.dto';

export class UpdateGroupDto extends PartialType(
  OmitType(CreateGroupDto, ['slug'] as const),
) {}
