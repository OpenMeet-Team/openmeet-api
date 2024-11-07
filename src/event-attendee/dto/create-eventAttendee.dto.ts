import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
} from '../../core/constants/constant';

export class CreateEventAttendeeDto {
  // @ApiProperty({
  //   description: 'event iD',
  // })
  // @IsNotEmpty()
  // @Type(() => Number)
  // @IsNumber()
  // eventId: number;

  // @ApiProperty({
  //   description: 'User',
  // })
  // @IsNotEmpty()
  // @Type(() => Number)
  // @IsNumber()
  // userId: number;

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
