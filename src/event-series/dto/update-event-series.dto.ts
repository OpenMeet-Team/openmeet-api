import {
  IsOptional,
  IsBoolean,
  IsString,
  IsNumber,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { CreateEventSeriesDto } from './create-event-series.dto';

export class UpdateEventSeriesDto extends PartialType(CreateEventSeriesDto) {
  // All fields are optional in an update DTO
  // Add any fields that have special update behavior here

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description:
      'Whether to propagate changes to future unmaterialized occurrences',
    example: true,
    required: false,
    default: true,
  })
  propagateChanges?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The slug of the template event for this series',
    example: 'template-event-123',
    required: false,
  })
  templateEventSlug?: string;

  // Direct template properties for the series
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The location for the event',
    example: '123 Main St, Louisville, KY',
    required: false,
  })
  location?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The online location (URL) for the event',
    example: 'https://zoom.us/j/123456789',
    required: false,
  })
  locationOnline?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The maximum number of attendees',
    example: 100,
    required: false,
  })
  maxAttendees?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether to require approval for attendees',
    example: false,
    required: false,
  })
  requireApproval?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The approval question to ask attendees',
    example: 'Why do you want to attend?',
    required: false,
  })
  approvalQuestion?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether to allow a waitlist for the event',
    example: true,
    required: false,
  })
  allowWaitlist?: boolean;

  @IsArray()
  @IsOptional()
  @ApiProperty({
    description: 'The IDs of categories for the event',
    example: [1, 2, 3],
    required: false,
  })
  categories?: number[];
}
