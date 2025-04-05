import { ApiProperty } from '@nestjs/swagger';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';
import { EventResponseDto } from '../../event/dto/event-response.dto';
import { RecurrenceRule } from '../interfaces/recurrence.interface';
import { Exclude, Type } from 'class-transformer';

export class EventSeriesResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  updatedAt: Date;

  @ApiProperty({ example: '01h2gjqm6kww5rbj6qhrp8vj9w' })
  ulid: string;

  @ApiProperty({ example: 'Waterfront Wednesdays' })
  name: string;

  @ApiProperty({ example: 'waterfront-wednesdays' })
  slug: string;

  @ApiProperty({
    example: 'A weekly concert series at the waterfront',
    nullable: true,
  })
  description: string;

  @ApiProperty({
    example: 'America/New_York',
    nullable: true,
  })
  timeZone: string;

  @ApiProperty({
    example: {
      freq: 'WEEKLY',
      interval: 1,
      byday: ['WE'],
    },
  })
  recurrenceRule: RecurrenceRule;

  @ApiProperty({
    example: 'Every Wednesday',
    nullable: true,
  })
  recurrenceDescription: string;

  @ApiProperty({
    example: '!abc123:matrix.org',
    nullable: true,
  })
  matrixRoomId: string;

  @ApiProperty({
    example: 123,
    nullable: true,
  })
  userId: number;

  @ApiProperty({
    example: 456,
    nullable: true,
  })
  groupId?: number | null;

  @ApiProperty({
    type: () => EventResponseDto,
    isArray: true,
    nullable: true,
  })
  @Type(() => EventResponseDto)
  occurrences?: EventResponseDto[];

  @ApiProperty({
    example: {
      id: 789,
      url: '/files/789',
      fileName: 'series-image.jpg',
    },
    nullable: true,
  })
  image?: any;

  // External source fields
  @ApiProperty({
    example: 'bluesky',
    nullable: true,
  })
  sourceType: string | null;

  @ApiProperty({
    example: 'at://did:plc:123456/app.bsky.feed.post/123',
    nullable: true,
  })
  sourceId: string | null;

  @ApiProperty({
    example: 'https://bsky.app/profile/user.bsky.social/post/123',
    nullable: true,
  })
  sourceUrl: string | null;

  @Exclude()
  sourceData: Record<string, unknown> | null;

  constructor(partial: Partial<EventSeriesEntity>) {
    Object.assign(this, partial);
  }
}
