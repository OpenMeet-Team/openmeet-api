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
  Admin = 'admin',
  Moderator = 'moderator',
  Member = 'member',
  Guest = 'guest',
}

export enum GroupPermission {
  ManageGroup = 'MANAGE_GROUP',
  ManageMembers = 'MANAGE_MEMBERS',
  ManageEvents = 'MANAGE_EVENTS',
  ManageDiscussions = 'MANAGE_DISCUSSIONS',
  ManageReports = 'MANAGE_REPORTS',
  ManageBilling = 'MANAGE_BILLING',
  CreateEvent = 'CREATE_EVENT',
  MessageDiscussion = 'MESSAGE_DISCUSSION',
  MessageMember = 'MESSAGE_MEMBER',
  SeeMembers = 'SEE_MEMBERS',
  SeeEvents = 'SEE_EVENTS',
  SeeDiscussions = 'SEE_DISCUSSIONS',
  SeeGroup = 'SEE_GROUP',
}

export enum Visibility {
  Public = 'public',
  Authenticated = 'authenticated',
  Private = 'private',
}

export enum GroupStatus {
  Draft = 'draft',
  Pending = 'pending',
  Published = 'published',
}

export enum GroupVisibility {
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

export enum EventType {
  InPerson = 'in-person',
  Online = 'online',
  Hybrid = 'hybrid',
}
