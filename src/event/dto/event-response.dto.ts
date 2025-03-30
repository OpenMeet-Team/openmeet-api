import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus, EventVisibility } from '../../core/constants/constant';
import { EventSourceType } from '../../core/constants/source-type.constant';
import { FileEntity } from '../../file/infrastructure/persistence/relational/entities/file.entity';
import { RecurrenceRuleDto } from './create-event.dto';

export class EventResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  ulid: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiPropertyOptional()
  image?: FileEntity;

  @ApiProperty()
  type: string;

  @ApiPropertyOptional()
  locationOnline?: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  startDate: Date;

  @ApiPropertyOptional()
  endDate?: Date;

  @ApiPropertyOptional()
  maxAttendees?: number;

  @ApiPropertyOptional()
  requireApproval?: boolean;

  @ApiPropertyOptional()
  approvalQuestion?: string;

  @ApiPropertyOptional()
  requireGroupMembership?: boolean;

  @ApiPropertyOptional()
  location?: string;

  @ApiPropertyOptional()
  lat?: number;

  @ApiPropertyOptional()
  lon?: number;

  @ApiPropertyOptional()
  status?: EventStatus;

  @ApiPropertyOptional()
  visibility?: EventVisibility;

  @ApiPropertyOptional()
  allowWaitlist?: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  matrixRoomId?: string;

  @ApiPropertyOptional()
  userId?: number;

  @ApiPropertyOptional()
  groupId?: number;

  @ApiPropertyOptional({ enum: EventSourceType })
  sourceType?: EventSourceType | null;

  @ApiPropertyOptional()
  sourceId?: string | null;

  @ApiPropertyOptional()
  sourceUrl?: string | null;

  @ApiPropertyOptional()
  sourceData?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  lastSyncedAt?: Date | null;

  // Recurring event fields
  @ApiPropertyOptional()
  timeZone?: string;

  @ApiPropertyOptional()
  recurrenceRule?: RecurrenceRuleDto;

  @ApiPropertyOptional({ type: [String] })
  recurrenceExceptions?: string[];

  @ApiPropertyOptional()
  recurrenceUntil?: Date;

  @ApiPropertyOptional()
  recurrenceCount?: number;

  @ApiPropertyOptional()
  isRecurring: boolean;

  @ApiPropertyOptional()
  parentEventId?: number;

  @ApiPropertyOptional()
  isRecurrenceException: boolean;

  @ApiPropertyOptional()
  originalDate?: Date;

  // Additional RFC 5545/7986 properties
  @ApiPropertyOptional()
  securityClass?: string;

  @ApiPropertyOptional()
  priority?: number;

  @ApiPropertyOptional()
  blocksTime: boolean;

  @ApiPropertyOptional()
  isAllDay?: boolean;

  @ApiPropertyOptional({ type: [String] })
  resources?: string[];

  @ApiPropertyOptional()
  color?: string;

  @ApiPropertyOptional()
  conferenceData?: Record<string, any>;

  // Computed fields
  @ApiPropertyOptional()
  attendeesCount?: number;

  // Customized computed fields for recurring events
  @ApiPropertyOptional()
  nextOccurrence?: Date;

  @ApiPropertyOptional({ type: [Date] })
  upcomingOccurrences?: Date[];

  @ApiPropertyOptional()
  recurrenceDescription?: string;
}
