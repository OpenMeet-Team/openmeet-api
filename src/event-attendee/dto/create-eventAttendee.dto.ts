import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { EventAttendeeStatus } from '../../core/constants/constant';
import { EventRoleEntity } from '../../event-role/infrastructure/persistence/relational/entities/event-role.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { EventSourceType } from '../../core/constants/source-type.constant';

export class CreateEventAttendeeDto {
  @ApiPropertyOptional({
    description: 'The approval answer of the Event Attendee',
  })
  @IsOptional()
  approvalAnswer?: string;

  @ApiPropertyOptional({
    description: 'The user of the Event Attendee',
  })
  user: UserEntity;

  @ApiPropertyOptional({
    description: 'The event of the Event Attendee',
  })
  event: EventEntity;

  @ApiPropertyOptional({
    description: 'The role of the Event Attendee',
  })
  @IsOptional()
  role?: EventRoleEntity;

  @ApiPropertyOptional({
    description: 'The status of the Event Attendee',
    enum: EventAttendeeStatus,
  })
  @IsOptional()
  status?: EventAttendeeStatus;

  // Source fields
  @ApiPropertyOptional({
    description: 'The type of the source for this attendee (e.g. BLUESKY)',
    enum: EventSourceType,
  })
  @IsOptional()
  sourceType?: EventSourceType;

  @ApiPropertyOptional({
    description:
      'The unique identifier for the external source of this attendance',
  })
  @IsOptional()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'URL to the external source',
  })
  @IsOptional()
  sourceUrl?: string;

  @ApiPropertyOptional({
    description: 'Additional data from the source',
    type: 'object',
  })
  @IsOptional()
  sourceData?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'When this attendance was last synced with the external source',
  })
  @IsOptional()
  lastSyncedAt?: Date;

  // Metadata field removed in favor of standardized SourceFields

}
