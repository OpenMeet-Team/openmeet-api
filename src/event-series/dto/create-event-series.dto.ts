import {
  IsString,
  IsOptional,
  IsObject,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { RecurrenceRuleDto } from '../../event/dto/create-event.dto';
import { TemplateEventDto } from './template-event.dto';

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

  @IsObject()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  @ApiProperty({
    description: 'The recurrence rule for the event series',
    type: RecurrenceRuleDto,
  })
  recurrenceRule: RecurrenceRuleDto;

  @IsObject()
  @ValidateNested()
  @Type(() => TemplateEventDto)
  @ApiProperty({
    description: 'The template event properties for the series',
    type: TemplateEventDto,
  })
  templateEvent: TemplateEventDto;

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
}
