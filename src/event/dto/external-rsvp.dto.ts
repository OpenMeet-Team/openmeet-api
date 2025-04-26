import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsISO8601,
  IsObject,
} from 'class-validator';
import { EventSourceType } from '../../core/constants/source-type.constant';

export class ExternalRsvpDto {
  @ApiProperty({
    description:
      'Source ID of the event being responded to - full AT Protocol URI',
    example: 'at://did:plc:abcdef123456/app.bsky.feed.post/3jui2dwarf2xa',
  })
  @IsString()
  @IsNotEmpty()
  eventSourceId: string;

  @ApiProperty({
    enum: EventSourceType,
    description: 'Source type of the event',
    example: EventSourceType.BLUESKY,
  })
  @IsEnum(EventSourceType)
  eventSourceType: EventSourceType;

  @ApiProperty({
    description: 'DID of the user making the RSVP',
    example: 'did:plc:xyz789abc',
  })
  @IsString()
  @IsNotEmpty()
  userDid: string;

  @ApiProperty({
    description: 'Handle of the user making the RSVP',
    example: 'user.bsky.social',
  })
  @IsString()
  @IsNotEmpty()
  userHandle: string;

  @ApiProperty({
    description: 'RSVP status from Bluesky',
    example: 'going',
    enum: ['interested', 'going', 'notgoing'],
  })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({
    description: 'Timestamp of the RSVP',
    example: '2023-09-15T18:00:00Z',
  })
  @IsISO8601()
  @IsOptional()
  timestamp?: string;

  @ApiPropertyOptional({
    description: 'Source ID of the RSVP record',
    example: 'at://did:plc:xyz789abc/app.bsky.rsvp/1234',
  })
  @IsString()
  @IsOptional()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Additional RSVP metadata',
    type: 'object',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
