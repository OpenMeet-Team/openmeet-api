import {
  IsString,
  IsOptional,
  IsObject,
  ValidateNested,
  IsNumber,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { RecurrenceRuleDto } from '../../event/dto/create-event.dto';
import { PartialType } from '@nestjs/swagger';
import { CreateEventSeriesDto } from './create-event-series.dto';

export class UpdateEventSeriesDto extends PartialType(CreateEventSeriesDto) {
  // All fields are optional in an update DTO
  // Add any fields that have special update behavior here

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether to propagate changes to future unmaterialized occurrences',
    example: true,
    required: false,
    default: true,
  })
  propagateChanges?: boolean;
}