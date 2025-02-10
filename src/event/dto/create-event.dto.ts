import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus, EventVisibility } from '../../core/constants/constant';
import { FileEntity } from '../../file/infrastructure/persistence/relational/entities/file.entity';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { SourceFields } from '../../core/interfaces/source-data.interface';

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

  @ApiProperty({
    description: 'The latitude of the event location',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat: number;

  @ApiProperty({
    description: 'The longitude of the event location',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lon: number;

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
