export enum SubCategoryType {
  EVENT = 'EVENT',
  GROUP = 'GROUP',
}

export enum EventStatus {
  Draft = 'draft',
  Pending = 'pending',
  Published = 'published',
  Cancelled = 'cancelled',
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
  DeleteGroup = 'DELETE_GROUP',
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

export enum UserPermission {
  CreateEvents = 'CREATE_EVENTS',
  ManageEvents = 'MANAGE_EVENTS',
  DeleteEvents = 'DELETE_EVENTS',
  CreateGroups = 'CREATE_GROUPS',
  ManageGroups = 'MANAGE_GROUPS',
  DeleteGroups = 'DELETE_GROUPS',
  ManageCategories = 'MANAGE_CATEGORIES',
  CreateCategories = 'CREATE_CATEGORIES',
  DeleteCategories = 'DELETE_CATEGORIES',
  ManageSettings = 'MANAGE_SETTINGS',
  CreateIssues = 'CREATE_ISSUES',
  ManageIssues = 'MANAGE_ISSUES',
  DeleteIssues = 'DELETE_ISSUES',
  CreateUsers = 'CREATE_USERS',
  ManageUsers = 'MANAGE_USERS',
  DeleteUsers = 'DELETE_USERS',
  CreateReports = 'CREATE_REPORTS',
  ManageReports = 'MANAGE_REPORTS',
  DeleteReports = 'DELETE_REPORTS',
  CreateDiscussions = 'CREATE_DISCUSSIONS',
  ManageDiscussions = 'MANAGE_DISCUSSIONS',
  DeleteDiscussions = 'DELETE_DISCUSSIONS',
  CreateAttendees = 'CREATE_ATTENDEES',
  ManageAttendees = 'MANAGE_ATTENDEES',
  DeleteAttendees = 'DELETE_ATTENDEES',
  ViewGroups = 'VIEW_GROUPS',
  ViewEvents = 'VIEW_EVENTS',
  AttendEvents = 'ATTEND_EVENTS',
  JoinGroups = 'JOIN_GROUPS',
  MessageMembers = 'MESSAGE_MEMBERS',
  MessageAttendees = 'MESSAGE_ATTENDEES',
  MessageUsers = 'MESSAGE_USERS',
}

export enum EventAttendeePermission {
  DeleteEvent = 'DELETE_EVENT',
  CancelEvent = 'CANCEL_EVENT',
  ManageEvent = 'MANAGE_EVENT',
  ApproveAttendees = 'APPROVE_ATTENDEES',
  DeleteAttendees = 'DELETE_ATTENDEES',
  ManageAttendees = 'MANAGE_ATTENDEES',
  ManageDiscussions = 'MANAGE_DISCUSSIONS',
  ViewEvent = 'VIEW_EVENT',
  AttendEvent = 'ATTEND_EVENT',
  MessageAttendees = 'MESSAGE_ATTENDEES',
  CreateDiscussion = 'CREATE_DISCUSSION',
  ViewDiscussion = 'VIEW_DISCUSSION',
}

export enum EventVisibility {
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
  Maybe = 'maybe',
  Pending = 'pending',
  Waitlist = 'waitlist',
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

export const IS_PUBLIC_KEY = 'isPublic';
export const IS_TENANT_PUBLIC_KEY = 'isTenantPublic';

export enum PostgisSrid {
  SRID = 4326,
}

export const DEFAULT_RADIUS = 200; // default radius in KM for location searching

// By default zulip creates a topic called channel events, we don't want to show this in the UI
export const ZULIP_DEFAULT_CHANNEL_TOPIC = 'channel events';

export interface TenantConfig {
  id: string; // tenant id, ex: asdf2jkl
  name: string; // tenant name, ex: Openmeet
  frontendDomain: string; // frontend domain, ex: platform.openmeet.net
  logoUrl: string; // logo url, ex: https://openmeet.net/logo.png
  companyDomain: string; // company domain, ex: openmeet.net
  confirmEmail: boolean; // confirm email, ex: true
  mailDefaultEmail: string; // mail default email, ex: hello@openmeet.net
  mailDefaultName: string; // mail default name, ex: Openmeet
  googleClientId: string; // google client id, ex: 1234567890
  googleClientSecret: string; // google client secret, ex: 0987654321
  githubClientId: string; // github client id, ex: 1234567890
  githubClientSecret: string; // github client secret, ex: 0987654321
}
