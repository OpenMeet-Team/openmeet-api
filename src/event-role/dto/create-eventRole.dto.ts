import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { EventAttendeeRole } from '../../core/constants/constant';

export class CreateEventRoleDto {
  @ApiProperty({
    description: 'Role of the event member',
    type: String,
  })
  @IsNotEmpty()
  @IsEnum(EventAttendeeRole)
  name: EventAttendeeRole;
}
