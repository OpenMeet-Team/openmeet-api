import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateEventAttendeeDto {
  @ApiProperty({
    description: 'event iD',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  eventId: number;

  // @ApiProperty({
  //   description: 'User',
  // })
  // @IsNotEmpty()
  // @Type(() => Number)
  // @IsNumber()
  // userId: number;

  @ApiProperty({ description: 'RSVP status of the attendee', example: 'going' })
  @IsOptional()
  @IsNotEmpty()
  rsvpStatus: string;

  @ApiProperty({ description: 'Is the user a host?', example: false })
  @IsBoolean()
  @IsOptional()
  isHost: boolean;
}
