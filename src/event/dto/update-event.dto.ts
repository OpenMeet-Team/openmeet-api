import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsNumber, IsString } from 'class-validator';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({
    description: 'Whether the event is part of a recurring series',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({
    description: 'The ID of the series this event belongs to',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  seriesId?: number;

  @ApiPropertyOptional({
    description: 'The slug of the series this event belongs to',
    example: 'weekly-team-meeting',
  })
  @IsOptional()
  @IsString()
  seriesSlug?: string;
}
