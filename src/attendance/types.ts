import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

export interface ResolvedEvent {
  tenantEvent: EventEntity | null;
  uri: string | null;
  isPublic: boolean;
  requiresApproval: boolean;
  allowWaitlist: boolean;
  maxAttendees: number;
  requireGroupMembership: boolean;
}

export interface AttendanceResult {
  status: string;
  rsvpUri: string | null;
  attendeeId: number | null;
  eventUri: string | null;
}

export interface AttendanceChangedEvent {
  status: string;
  previousStatus: string | null;
  eventUri: string | null;
  eventId: number | null;
  eventSlug: string | null;
  userUlid: string;
  userDid: string | null;
  tenantId: string;
}
