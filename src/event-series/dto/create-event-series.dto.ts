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

export class CreateEventSeriesDto {
  @IsString()
  @ApiProperty({
    description: 'The name of the event series',
    example: 'Waterfront Wednesdays',
  })
  name: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'The slug for the event series (auto-generated if not provided)',
    example: 'waterfront-wednesdays',
    required: false,
  })
  slug?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The description of the event series',
    example: 'Weekly concert series at the waterfront',
    required: false,
  })
  description?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The timezone for the event series',
    example: 'America/New_York',
    required: false,
  })
  timeZone?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  @ApiProperty({
    description: 'The recurrence rule for the event series',
    type: RecurrenceRuleDto,
  })
  recurrenceRule: RecurrenceRuleDto;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The ID of the image file for the event series',
    example: 123,
    required: false,
  })
  imageId?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The ID of the group associated with the event series',
    example: 456,
    required: false,
  })
  groupId?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The matrix room ID for the event series',
    example: '!abc123:matrix.org',
    required: false,
  })
  matrixRoomId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The external source type',
    example: 'bluesky',
    required: false,
  })
  sourceType?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The external source ID',
    example: 'at://did:plc:123456/app.bsky.feed.post/123',
    required: false,
  })
  sourceId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The external source URL',
    example: 'https://bsky.app/profile/user.bsky.social/post/123',
    required: false,
  })
  sourceUrl?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Additional data from the external source',
    example: { originalAuthor: 'user.bsky.social' },
    required: false,
  })
  sourceData?: Record<string, unknown>;

  // Event template properties for generating occurrences
  @IsString()
  @ApiProperty({
    description: 'The start date and time for the template event',
    example: '2023-01-01T10:00:00Z',
  })
  templateStartDate: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The end date and time for the template event',
    example: '2023-01-01T12:00:00Z',
    required: false,
  })
  templateEndDate?: string;

  @IsString()
  @ApiProperty({
    description: 'The type of event',
    example: 'in-person',
    enum: ['online', 'in-person', 'hybrid'],
  })
  templateType: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The location for in-person or hybrid events',
    example: '123 Main St, Louisville, KY',
    required: false,
  })
  templateLocation?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The online location (URL) for online or hybrid events',
    example: 'https://zoom.us/j/123456789',
    required: false,
  })
  templateLocationOnline?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The maximum number of attendees',
    example: 100,
    required: false,
  })
  templateMaxAttendees?: number;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether to require approval for attendees',
    example: false,
    required: false,
  })
  templateRequireApproval?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The approval question to ask attendees',
    example: 'Why do you want to attend?',
    required: false,
  })
  templateApprovalQuestion?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether to allow a waitlist for the event',
    example: true,
    required: false,
  })
  templateAllowWaitlist?: boolean;

  @IsArray()
  @IsOptional()
  @ApiProperty({
    description: 'The IDs of categories for the event',
    example: [1, 2, 3],
    required: false,
  })
  templateCategories?: number[];
}
