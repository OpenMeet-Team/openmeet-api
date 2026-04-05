import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';

/**
 * Mapping from ATProto lexicon mode values to OpenMeet EventType strings.
 * Used by AtprotoEnrichmentService when converting ATProto records.
 */
export const MODE_TO_EVENT_TYPE: Record<string, string> = {
  'community.lexicon.calendar.event#inperson': 'in-person',
  'community.lexicon.calendar.event#virtual': 'online',
  'community.lexicon.calendar.event#hybrid': 'hybrid',
};

/** Event sourced from public ATProto records (via Contrail or any indexer) */
export interface AtprotoSourcedEvent {
  source: 'atproto';
  atprotoUri: string;
  atprotoRkey: string;
  atprotoCid: string | null;
  name: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  type: string;
  status: string;
  location: string | null;
  locationOnline: string | null;
  lat: number | null;
  lon: number | null;
  attendeesCount: number;
  id?: number;
  ulid?: string;
  slug: string;
  group?: EventEntity['group'];
  image?: EventEntity['image'];
  categories?: EventEntity['categories'];
  series?: EventEntity['series'];
  seriesSlug?: string | null;
  maxAttendees?: number;
  requireApproval?: boolean;
  allowWaitlist?: boolean;
  timeZone?: string | null;
  conferenceData?: any;
  visibility?: string;
  user?: { name: string; slug: string | null } | EventEntity['user'];
}

/** Event sourced from tenant database (private/unlisted — never on ATProto) */
export interface TenantSourcedEvent {
  source: 'tenant';
  id: number;
  ulid: string;
  slug: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  attendeesCount: number;
  [key: string]: unknown;
}

export type EnrichedEvent = AtprotoSourcedEvent | TenantSourcedEvent;
