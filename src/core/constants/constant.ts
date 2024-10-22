export enum SubCategoryType {
  EVENT = 'EVENT',
  GROUP = 'GROUP',
}

export enum Status {
  Draft = 'draft',
  Pending = 'pending',
  Published = 'published',
}

export enum GroupRole {
  Owner = 'owner',
  Moderator = 'moderator',
  Member = 'member',
}

export enum Visibility {
  Public = 'public',
  Authenticated = 'authenticated',
  Private = 'private',
}

export enum EventAttendeeRole {
  Participant = 'participant',
  Host = 'host',
  Speaker = 'speaker',
  Moderator = 'moderator',
  Guest = 'guest',
}

export enum EventAttendeeStatus {
  Invited = 'invited',
  Confirmed = 'confirmed',
  Attended = 'attended',
  Cancelled = 'cancelled',
  Rejected = 'rejected',
}

export enum EntityType {
  User = 'user',
  Event = 'event',
  Group = 'group',
}
