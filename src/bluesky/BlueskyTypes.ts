export interface BlueskyLocation {
  type: string;
  lat?: number;
  lon?: number;
  description?: string;
  uri?: string;
  name?: string;
}

export interface BlueskyEventUri {
  uri: string;
  name?: string;
}

export enum EventSourceType {
  BLUESKY = 'bluesky',
  EVENTBRITE = 'eventbrite',
  FACEBOOK = 'facebook',
  LUMA = 'luma',
  MEETUP = 'meetup',
  OTHER = 'other',
  WEB = 'web',
}

export interface BlueskyEvent {
  uri: string;
  cid: string;
  value: {
    $type: string;
    name: string;
    description?: string;
    createdAt: string;
    startsAt: string;
    endsAt?: string;
    mode?: string;
    status?: string;
    locations?: Array<{
      type: string;
      lat?: number;
      lon?: number;
      description?: string;
      uri?: string;
      name?: string;
    }>;
  };
}

// Constants for Bluesky collection names
export const BLUESKY_COLLECTIONS = {
  EVENT: 'community.lexicon.calendar.event',
  RSVP: 'community.lexicon.calendar.rsvp',
};

// RSVP status values with full NSID prefix per community.lexicon.calendar.rsvp spec
export const RSVP_STATUS = {
  going: 'community.lexicon.calendar.rsvp#going',
  interested: 'community.lexicon.calendar.rsvp#interested',
  notgoing: 'community.lexicon.calendar.rsvp#notgoing',
} as const;

export type RsvpStatusShort = 'going' | 'interested' | 'notgoing';
export type RsvpStatusFull = (typeof RSVP_STATUS)[RsvpStatusShort];

// StrongRef type per com.atproto.repo.strongRef
export interface StrongRef {
  uri: string;
  cid: string;
}
