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

  @ApiPropertyOptional({
    description: 'The slug of the series this event belongs to',
    example: 'weekly-team-meeting',
  })
  seriesSlug?: string;

  @ApiPropertyOptional({
    description: 'Whether the user can manage the series (edit, delete, etc.)',
    example: false,
    default: false,
  })
  canManageSeries?: boolean;

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

  @ApiProperty({
    description: 'Human-readable description of the recurrence pattern',
  })
  recurrenceDescription?: string;

  /**
   * Constructor that creates an EventResponseDto from an EventEntity
   */
  constructor(partial: Partial<any>) {
    if (partial) {
      // Only map fields that are explicitly defined in the DTO
      this.id = partial.id;
      this.ulid = partial.ulid;
      this.name = partial.name;
      this.slug = partial.slug;
      this.image = partial.image;
      this.type = partial.type;
      this.locationOnline = partial.locationOnline;
      this.description = partial.description;
      this.startDate = partial.startDate;
      this.endDate = partial.endDate;
      this.maxAttendees = partial.maxAttendees;
      this.requireApproval = partial.requireApproval;
      this.approvalQuestion = partial.approvalQuestion;
      this.requireGroupMembership = partial.requireGroupMembership;
      this.location = partial.location;
      this.lat = partial.lat;
      this.lon = partial.lon;
      this.status = partial.status;
      this.visibility = partial.visibility;
      this.allowWaitlist = partial.allowWaitlist;
      this.createdAt = partial.createdAt;
      this.updatedAt = partial.updatedAt;
      this.matrixRoomId = partial.matrixRoomId;
      this.userId =
        partial.userId || (partial.user?.id ? partial.user.id : undefined);
      this.groupId =
        partial.groupId || (partial.group?.id ? partial.group.id : undefined);
      this.sourceType = partial.sourceType;
      this.sourceId = partial.sourceId;
      this.sourceUrl = partial.sourceUrl;
      this.sourceData = partial.sourceData;
      this.lastSyncedAt = partial.lastSyncedAt;
      this.timeZone = partial.timeZone;
      this.recurrenceRule = partial.recurrenceRule;
      this.recurrenceExceptions = partial.recurrenceExceptions;
      this.recurrenceUntil = partial.recurrenceUntil;
      this.recurrenceCount = partial.recurrenceCount;

      // isRecurring is now properly computed in the entity based on seriesSlug
      // Let's ensure it's consistent here too
      this.isRecurring = partial.seriesSlug ? true : !!partial.isRecurring;

      this.parentEventId = partial.parentEventId;
      this.isRecurrenceException = partial.isRecurrenceException;
      this.originalDate = partial.originalDate;
      this.seriesSlug = partial.seriesSlug;
      this.canManageSeries = partial.canManageSeries || false;
      this.securityClass = partial.securityClass;
      this.priority = partial.priority;
      this.blocksTime = partial.blocksTime;
      this.isAllDay = partial.isAllDay;
      this.resources = partial.resources;
      this.color = partial.color;
      this.conferenceData = partial.conferenceData;
      this.attendeesCount = partial.attendeesCount;
      this.nextOccurrence = partial.nextOccurrence;
      this.upcomingOccurrences = partial.upcomingOccurrences;
      this.recurrenceDescription = partial.recurrenceDescription;
    }
  }
}
