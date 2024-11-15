import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { EventAttendeeStatus } from '../../core/constants/constant';
import { EventRoleEntity } from '../../event-role/infrastructure/persistence/relational/entities/event-role.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';

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
}
