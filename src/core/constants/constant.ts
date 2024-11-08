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
  // Admin Permissions
  CreateEvent = 'CREATE_EVENTS',
  ManageEvent = 'MANAGE_EVENTS',
  DeleteEvent = 'DELETE_EVENTS',
  CreateGroup = 'CREATE_GROUPS',
  ManageGroup = 'MANAGE_GROUPS',
  DeleteGroup = 'DELETE_GROUPS',
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
  // User Permissions
  ViewGroups = 'VIEW_GROUPS',
  ViewEvents = 'VIEW_EVENTS',
  AttendEvents = 'ATTEND_EVENTS',
  JoinGroups = 'JOIN_GROUPS',
  MessageMembers = 'MESSAGE_MEMBERS',
  MessageAttendees = 'MESSAGE_ATTENDEES',
  MessageUsers = 'MESSAGE_USERS',
}

export enum EventPermission {
  // participant permissions
  ViewEvent = 'VIEW_EVENT',
  AttendEvent = 'ATTEND_EVENT',
  MessageAttendees = 'MESSAGE_ATTENDEES',
  CreateDiscussion = 'CREATE_DISCUSSION',

  // Host permissions
  ManageEvent = 'MANAGE_EVENT',
  ApproveAttendees = 'APPROVE_ATTENDEES',
  ManageAttendees = 'MANAGE_ATTENDEES',
  ManageDiscussions = 'MANAGE_DISCUSSIONS',
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
