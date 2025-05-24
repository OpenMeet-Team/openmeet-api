export enum MessageType {
  GROUP_ANNOUNCEMENT = 'group_announcement',
  EVENT_ANNOUNCEMENT = 'event_announcement',
  INDIVIDUAL_MESSAGE = 'individual_message',
  ADMIN_CONTACT = 'admin_contact',
}

export enum MessageStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  SENT = 'sent',
  REJECTED = 'rejected',
}

export enum MessageChannel {
  EMAIL = 'email',
  SMS = 'sms',
  BLUESKY = 'bluesky',
  WHATSAPP = 'whatsapp',
}

export interface MessageRecipient {
  userId: number;
  email?: string;
  phoneNumber?: string;
  blueskyHandle?: string;
  preferredChannels: MessageChannel[];
}

export interface MessageDraft {
  id?: number;
  type: MessageType;
  subject: string;
  content: string;
  htmlContent?: string;
  templateId?: string;
  channels: MessageChannel[];

  // Context
  groupId?: number;
  eventId?: number;

  // Recipients
  recipientUserIds?: number[];
  recipientFilter?: 'all' | 'members' | 'attendees' | 'admins' | 'moderators';

  // Workflow
  authorId: number;
  reviewerId?: number;
  status: MessageStatus;

  // Scheduling
  scheduledAt?: Date;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
}

export interface MessageLog {
  id: number;
  messageId: number;
  recipientUserId: number;
  channel: MessageChannel;
  status: 'sent' | 'failed' | 'bounced' | 'delivered';
  sentAt: Date;
  deliveredAt?: Date;
  error?: string;
}

export interface SendMessageRequest {
  type: MessageType;
  subject: string;
  content: string;
  htmlContent?: string;
  templateId?: string;
  channels: MessageChannel[];

  // Context
  groupSlug?: string;
  eventSlug?: string;

  // Recipients
  recipientUserIds?: number[];
  recipientFilter?: 'all' | 'members' | 'attendees' | 'admins' | 'moderators';

  // Workflow
  requireReview?: boolean;
  scheduledAt?: Date;
}

export interface MessageAuditEntry {
  id: number;
  tenantId: string;
  userId: number;
  action:
    | 'draft_created'
    | 'message_sent'
    | 'review_requested'
    | 'message_approved'
    | 'message_rejected'
    | 'rate_limit_exceeded'
    | 'message_send_skipped';
  groupId?: number;
  eventId?: number;
  messageId?: number;
  details?: Record<string, any>;
  createdAt: Date;
}
