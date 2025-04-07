import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TemplateEventDto {
  @IsString()
  @ApiProperty({
    description: 'The start date and time for the template event',
    example: '2023-01-01T10:00:00Z',
  })
  startDate: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The end date and time for the template event',
    example: '2023-01-01T12:00:00Z',
    required: false,
  })
  endDate?: string;

  @IsString()
  @ApiProperty({
    description: 'The type of event',
    example: 'in-person',
    enum: ['online', 'in-person', 'hybrid'],
  })
  type: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The location for in-person or hybrid events',
    example: '123 Main St, Louisville, KY',
    required: false,
  })
  location?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The online location (URL) for online or hybrid events',
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
