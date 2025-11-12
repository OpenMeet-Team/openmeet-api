import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  ValidateNested,
  IsObject,
  IsIn,
  Min,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus, EventVisibility } from '../../core/constants/constant';
import { FileEntity } from '../../file/infrastructure/persistence/relational/entities/file.entity';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { SourceFields } from '../../core/interfaces/source-data.interface';
import { RecurrenceFrequency } from '../../event-series/interfaces/recurrence.interface';

/**
 * Custom validator to ensure end date is after start date
 */
@ValidatorConstraint({ name: 'IsAfterStartDate', async: false })
export class IsAfterStartDateConstraint
  implements ValidatorConstraintInterface
{
  validate(endDate: any, args: ValidationArguments) {
    const object = args.object as any;
    if (!endDate || !object.startDate) {
      return true; // Skip validation if either date is missing
    }
    const start = new Date(object.startDate).getTime();
    const end = new Date(endDate).getTime();
    return end > start;
  }

  defaultMessage(_args: ValidationArguments) {
    return 'End date must be after start date';
  }
}

export class RecurrenceRuleDto {
  @ApiProperty({
    description: 'Frequency of the recurrence',
    enum: RecurrenceFrequency,
    example: RecurrenceFrequency.WEEKLY,
  })
  @IsEnum(RecurrenceFrequency)
  frequency: RecurrenceFrequency;

  @ApiPropertyOptional({
    description: 'Interval between recurrences (e.g., every 2 weeks)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  interval?: number;

  @ApiPropertyOptional({
    description:
      'Number of occurrences (either count or until should be specified, not both)',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  count?: number;

  @ApiPropertyOptional({
    description:
      'End date of recurrence (either count or until should be specified, not both)',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  until?: string;

  @ApiPropertyOptional({
    description: 'Days of the week (SU, MO, TU, WE, TH, FR, SA)',
    example: ['MO', 'WE', 'FR'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  byweekday?: string[];

  @ApiPropertyOptional({
    description: 'Months of the year (1-12)',
    example: [1, 4, 7, 10],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  bymonth?: number[];

  @ApiPropertyOptional({
    description: 'Days of the month (1-31 or -31 to -1)',
    example: [1, 15],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  bymonthday?: number[];

  @ApiPropertyOptional({
    description:
      'Positions within a month/year (e.g., 1 for first, 2 for second, -1 for last)',
    example: [1],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  bysetpos?: number[];

  @ApiPropertyOptional({
    description: 'Week start day (SU, MO, TU, WE, TH, FR, SA)',
    example: 'MO',
    default: 'MO',
  })
  @IsOptional()
  @IsString()
  @IsIn(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'])
  wkst?: string;
}

export class CreateEventDto implements SourceFields {
  @ApiProperty({
    description: 'The name of the event',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'The image of the event',
    type: () => FileEntity,
  })
  @IsOptional()
  image?: FileEntity;

  // @ApiProperty({
  //   description: 'The slug of the group',
  // })
  // @IsString()
  // @IsOptional()
  // slug?: string;

  @ApiProperty({
    description: 'The description of the event',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({
    description: 'The start date of the event in ISO format',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: Date;

  @ApiProperty({
    description: 'The end date of the event in ISO format',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  @Validate(IsAfterStartDateConstraint)
  endDate?: Date;

  @ApiProperty({
    description: 'The type of the event',
  })
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({
    description: 'The online link of the event',
  })
  @IsString()
  @IsOptional()
  locationOnline: string;

  @ApiProperty({
    description: 'Max number of attendees to the event',
  })
  @IsNumber()
  maxAttendees: number;

  @ApiProperty({
    description: 'Categories of the event',
    type: [Number],
  })
  @IsArray({})
  @Type(() => Number)
  categories: number[]; // Array of category IDs

  @ApiProperty({
    description: 'If the event requires approval for attendance',
  })
  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @ApiProperty({
    description: 'If the event requires group membership',
  })
  @IsOptional()
  @IsBoolean()
  requireGroupMembership?: boolean;

  @ApiProperty({
    description: 'The approval question for the event',
  })
  @IsOptional()
  @IsString()
  approvalQuestion?: string;

  @ApiProperty({
    description: 'If the event allows waitlist',
  })
  @IsOptional()
  @IsBoolean()
  allowWaitlist?: boolean;

  @ApiProperty({
    description: 'The location for the event',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The latitude of the event location',
    example: 38.2527,
    required: false,
  })
  lat?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({
    description: 'The longitude of the event location',
    example: -85.7585,
    required: false,
  })
  lon?: number;

  @ApiPropertyOptional({
    description: 'The status of the event',
    enum: EventStatus,
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({
    description: 'The visibility of the event',
    enum: EventVisibility,
  })
  @IsOptional()
  @IsEnum(EventVisibility)
  visibility?: EventVisibility;

  @ApiPropertyOptional({
    description: 'Group entity',
  })
  @IsOptional()
  group?: { id: number } | GroupEntity;

  // Recurrence fields
  @ApiProperty({
    description: 'Timezone identifier (e.g., "America/New_York")',
    example: 'America/New_York',
  })
  @IsString()
  timeZone: string;

  @ApiPropertyOptional({
    description: 'Recurrence rule following RFC 5545 standards',
    type: RecurrenceRuleDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrenceRule?: RecurrenceRuleDto;

  @ApiPropertyOptional({
    description: 'Exception dates excluded from the recurrence pattern',
    type: [String],
    example: ['2024-12-25T09:00:00Z', '2025-01-01T09:00:00Z'],
  })
  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  recurrenceExceptions?: string[];

  @ApiPropertyOptional({
    description:
      'End date of recurrence (alternative to setting in recurrenceRule)',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string;

  @ApiPropertyOptional({
    description:
      'Number of occurrences (alternative to setting in recurrenceRule)',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  recurrenceCount?: number;

  // Additional RFC 5545/7986 properties
  @ApiPropertyOptional({
    description: 'Security classification (PUBLIC, PRIVATE, CONFIDENTIAL)',
    enum: ['PUBLIC', 'PRIVATE', 'CONFIDENTIAL'],
    example: 'PUBLIC',
  })
  @IsOptional()
  @IsString()
  @IsIn(['PUBLIC', 'PRIVATE', 'CONFIDENTIAL'])
  securityClass?: string;

  @ApiPropertyOptional({
    description: 'Event priority (0-9, with 0 being undefined)',
    example: 5,
    minimum: 0,
    maximum: 9,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({
    description:
      'Whether the event blocks time on a calendar (OPAQUE) or not (TRANSPARENT)',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  blocksTime?: boolean;

  @ApiPropertyOptional({
    description: 'Whether the event is an all-day event',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiPropertyOptional({
    description:
      'Resources needed for the event (e.g., projector, conference room)',
    type: [String],
    example: ['Projector', 'Whiteboard'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  resources?: string[];

  @ApiPropertyOptional({
    description: 'Color for the event (hex code or name)',
    example: '#4A76B8',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    description: 'Conference data for virtual meetings',
    example: {
      type: 'zoom',
      url: 'https://zoom.us/j/123456789',
      password: 'meeting',
    },
  })
  @IsOptional()
  @IsObject()
  conferenceData?: Record<string, any>;

  // Source fields
  @ApiPropertyOptional({
    enum: [
      'bluesky',
      'eventbrite',
      'facebook',
      'luma',
      'meetup',
      'other',
      'web',
    ],
  })
  @IsOptional()
  @IsEnum([
    'bluesky',
    'eventbrite',
    'facebook',
    'luma',
    'meetup',
    'other',
    'web',
  ])
  sourceType?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  sourceData?: {
    handle?: string;
    [key: string]: any;
  } | null;

  @ApiPropertyOptional()
  @IsOptional()
  lastSyncedAt?: Date | null;

  @ApiPropertyOptional({
    description: 'The slug of the event series this event belongs to',
    example: 'weekly-team-meeting',
  })
  @IsOptional()
  @IsString()
  seriesSlug?: string;
}

export class CommentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  message: string;

  // @ApiProperty()
  // @IsOptional()
  // @IsNumber()
  // eventId: number;
}

export class EventTopicCommentDto {
  @ApiProperty({
    description: 'The content of the comment',
  })
  content: string;

  @ApiProperty({
    description: 'The topic id of the event',
  })
  @IsOptional()
  @IsString()
  topic?: string;
}
