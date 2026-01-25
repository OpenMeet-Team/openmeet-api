import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsISO8601,
  IsObject,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsUrl,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  EventType,
  EventStatus,
  EventVisibility,
} from '../../core/constants/constant';
import { EventSourceType } from '../../core/constants/source-type.constant';

export class ExternalEventLocationDto {
  @ApiProperty({
    description: 'Location description',
    example: '123 Main St, New York, NY',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Location latitude (accepts string or number per AT Protocol)',
    example: 40.7128,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? parseFloat(value) : value,
  )
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({
    description:
      'Location longitude (accepts string or number per AT Protocol)',
    example: -74.006,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? parseFloat(value) : value,
  )
  @IsNumber()
  @IsOptional()
  lon?: number;

  @ApiPropertyOptional({
    description: 'Online location URL',
    example: 'https://meet.google.com/xyz',
  })
  @IsUrl()
  @IsOptional()
  url?: string;
}

export class ExternalEventSourceDto {
  @ApiProperty({
    enum: EventSourceType,
    description: 'Source type',
    example: EventSourceType.BLUESKY,
  })
  @IsEnum(EventSourceType)
  type: EventSourceType;

  @ApiProperty({
    description: 'Source identifier',
    example: 'did:plc:abcdef123456',
  })
  @IsString()
  id: string;

  @ApiPropertyOptional({
    description: 'URL to the original event',
    example: 'https://bsky.app/profile/user.bsky.social/post/3jxurz23lot2e',
  })
  @IsUrl()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional({
    description: 'Additional source metadata',
    type: 'object',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Handle of the creator',
    example: 'user.bsky.social',
  })
  @IsString()
  @IsOptional()
  handle?: string;
}

export class ExternalEventDto {
  @ApiProperty({ description: 'Event name', example: 'Community Meetup' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Event description',
    example: 'Join us for our monthly community meetup!',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Event start date and time',
    example: '2023-06-15T18:00:00Z',
  })
  @IsISO8601()
  startDate: string;

  @ApiPropertyOptional({
    description: 'Event end date and time',
    example: '2023-06-15T20:00:00Z',
  })
  @IsISO8601()
  @IsOptional()
  endDate?: string;

  @ApiProperty({
    enum: EventType,
    description: 'Event type',
    example: EventType.InPerson,
  })
  @IsEnum(EventType)
  type: EventType;

  @ApiPropertyOptional({
    enum: EventStatus,
    description: 'Event status',
    example: EventStatus.Published,
    default: EventStatus.Published,
  })
  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus = EventStatus.Published;

  @ApiPropertyOptional({
    enum: EventVisibility,
    description: 'Event visibility',
    example: EventVisibility.Public,
    default: EventVisibility.Public,
  })
  @IsEnum(EventVisibility)
  @IsOptional()
  visibility?: EventVisibility = EventVisibility.Public;

  @ApiPropertyOptional({
    description: 'Event location information',
    type: ExternalEventLocationDto,
  })
  @ValidateNested()
  @Type(() => ExternalEventLocationDto)
  @IsOptional()
  location?: ExternalEventLocationDto;

  @ApiPropertyOptional({
    description: 'Event image information. Images are uploaded seperately',
    type: 'object',
    example: { id: 450 },
  })
  @IsObject()
  @IsOptional()
  image?: { id: number };

  @ApiProperty({
    description: 'Event source information',
    type: ExternalEventSourceDto,
  })
  @ValidateNested()
  @Type(() => ExternalEventSourceDto)
  source: ExternalEventSourceDto;

  @ApiPropertyOptional({
    description: 'Category names to associate with the event',
    example: ['community', 'tech'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @ApiPropertyOptional({
    description: 'Whether this is part of a recurring series',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean = false;

  @ApiPropertyOptional({
    description: 'Recurrence pattern information for recurring events',
    type: 'object',
  })
  @IsObject()
  @IsOptional()
  recurrenceRule?: Record<string, any>;
}
