import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({
    description: 'Whether the event is part of a recurring series',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}
