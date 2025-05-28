# Messaging System Design Document

## Overview

This document defines the requirements, architecture, and design decisions for OpenMeet's unified messaging system. The goal is to enable various types of communication between users across multiple channels while maintaining privacy, preventing abuse, and providing a good user experience.

## 🎯 Current Implementation Status (January 2025)

### ✅ **Fully Implemented & Production Ready**
- **Group Admin Messaging**: Complete admin-to-member messaging with targeted user selection
- **Event Admin Messaging**: Complete organizer-to-attendee messaging 
- **Member-to-Admin Contact**: Complete member-to-admin contact system for groups
- **Email Security**: All templates secured with no email address leakage, HTML + plain text versions
- **Preview Functionality**: Test emails before sending to recipients
- **Delivery Tracking**: Success/failure counts and comprehensive error handling
- **Permission-Based Access**: Secure role-based messaging controls

### 🚧 **Next Priority Implementation (Phase 2.5)**
- **Event Attendee-to-Organizer Contact**: Missing reverse communication for events
  - **Gap**: Events missing equivalent of group member-to-admin contact system
  - **Solution**: Mirror existing group contact pattern for events (5 dev hours estimated)
  - **Files Ready**: Proven patterns from group implementation can be directly adapted

### 🔄 **Current Messaging Flow Coverage**
```
✅ Group Admin → Group Members (with targeting)
✅ Group Members → Group Admins (secure contact system)
✅ Event Organizers → Event Attendees  
🚧 Event Attendees → Event Organizers (MISSING - Phase 2.5)
✅ System → All Users (transactional emails)
✅ Member ↔ Member (Matrix chat)
```

### 📧 **Email Infrastructure Status**
- **MJML Templates**: Professional responsive design with tenant branding
- **Plain Text Support**: All emails include text versions for accessibility
- **Security Compliance**: No user email exposure, safe reply workflows
- **Template Coverage**: Admin messaging, member contact, system notifications
- **Delivery Reliability**: Error handling, duplicate prevention, admin copies

## Communication Channels Available

### **Current Channels**
- **Email** - SMTP via existing MailService (✓ Implemented)
- **Matrix Chat** - Real-time chat rooms (✓ Implemented)
- **Bluesky** - Social platform integration (✓ Implemented) 
- **Web Platform** - In-app messaging interface (⚠️ Partial)

### **Potential Future Channels**
- **SMS** - Text messaging for urgent notifications
- **WhatsApp Business API** - Popular messaging platform
- **Push Notifications** - Mobile app notifications
- **Discord** - Gaming/community focused
- **Slack** - Professional communication

### **Channel Characteristics**

| **Channel** | **Real-time** | **Privacy** | **Rich Content** | **External Access** | **Cost** |
|-------------|---------------|-------------|------------------|---------------------|----------|
| **Email** | No | Medium | Yes (HTML) | Yes | Low |
| **Matrix Chat** | Yes | High | Yes | No (requires login) | Free |
| **Bluesky** | Yes | Low | Limited | Yes | Free |
| **SMS** | Near real-time | Low | No | Yes | Medium |
| **WhatsApp** | Yes | Medium | Yes | Yes | Low |
| **Web Platform** | Yes | High | Yes | No (requires login) | Free |

## Communication Requirements

### **Core Communication Types**

| **From** | **To** | **Purpose** | **Urgency** | **Privacy Needs** | **Best Channels** | **Status** |
|----------|--------|-------------|-------------|-------------------|-------------------|------------|
| **Admin/Owner** | **Group Members** | Announcements, updates | Medium | Medium | Email, Matrix, Web | ✅ **IMPLEMENTED** |
| **Admin/Host** | **Event Attendees** | Event communication | High | Medium | SMS, Email, WhatsApp | ✅ **IMPLEMENTED** |
| **Admin/Moderator** | **Individual User** | Vetting, moderation | Medium | High | Web, Email | ✅ **IMPLEMENTED** (targeted messaging) |
| **System** | **Admins** | Notifications | Medium | Low | Email, SMS, Push | ✅ **IMPLEMENTED** |
| **Member** | **Other Members** | Peer communication | Low | High | Matrix, Web, WhatsApp | ✅ **IMPLEMENTED** (Matrix) |
| **Member** | **Admins/Moderators** | Questions, reports | Medium | Medium | Web, Email | ✅ **IMPLEMENTED** |
| **Event Attendee** | **Event Organizers** | Questions, reports | Medium | Medium | Web, Email | 🚧 **PLANNED** (Phase 2.5) |
| **Guest/Applicant** | **Admins** | Application process | Medium | High | Web, Email | ⚠️ **PARTIAL** |
| **System** | **All Users** | Transactional | High | Low | Email, SMS | ✅ **IMPLEMENTED** |

## User Channel Preferences

### **Channel Selection Strategy**

#### **User Preference Model**
```typescript
interface UserCommunicationPreferences {
  // Per-message-type preferences
  groupAnnouncements: ChannelPreference;
  eventUpdates: ChannelPreference;
  directMessages: ChannelPreference;
  adminMessages: ChannelPreference;
  systemNotifications: ChannelPreference;
  
  // Channel availability
  enabledChannels: {
    email: { address: string; verified: boolean };
    sms: { number: string; verified: boolean };
    matrix: { userId: string; active: boolean };
    bluesky: { handle: string; connected: boolean };
    whatsapp: { number: string; verified: boolean };
  };
  
  // Fallback strategy
  fallbackChannel: 'email' | 'sms';
  allowChannelFallback: boolean;
}

interface ChannelPreference {
  primary: MessageChannel;
  fallback?: MessageChannel;
  urgency: {
    immediate: MessageChannel;  // "Event cancelled"
    normal: MessageChannel;     // "Weekly group update"  
    digest: MessageChannel;     // "Daily summary"
  };
  timeRestrictions?: {
    quietHours: { start: string; end: string }; // "22:00" to "08:00"
    timezone: string;
  };
}
```

#### **Smart Channel Selection**
```typescript
interface MessageDeliveryPlan {
  messageId: string;
  recipients: RecipientDeliveryPlan[];
}

interface RecipientDeliveryPlan {
  userId: string;
  selectedChannel: MessageChannel;
  reason: 'user_preference' | 'channel_unavailable' | 'urgency_override' | 'fallback';
  alternativeChannels: MessageChannel[];
  deliveryTime: 'immediate' | 'next_digest' | 'quiet_hours_end';
}

// Example logic:
async function selectChannelForMessage(message: Message, recipient: User): Promise<MessageChannel> {
  const prefs = await getUserPreferences(recipient.id);
  const messageTypePrefs = prefs[message.type];
  
  // Check urgency override
  if (message.urgency === 'immediate' && message.type === 'event_update') {
    return messageTypePrefs.urgency.immediate; // Might be SMS for event cancellations
  }
  
  // Check if primary channel is available
  if (isChannelAvailable(messageTypePrefs.primary, recipient)) {
    return messageTypePrefs.primary;
  }
  
  // Try fallback
  if (messageTypePrefs.fallback && isChannelAvailable(messageTypePrefs.fallback, recipient)) {
    return messageTypePrefs.fallback;
  }
  
  // Use user's global fallback
  return prefs.fallbackChannel;
}
```

### **Channel-Specific Adaptations**

#### **Email** 
```typescript
interface EmailMessage {
  rich: boolean;           // HTML vs plain text
  threading: boolean;      // Reply-to threading
  attachments: boolean;    // File attachments
  unsubscribe: boolean;    // Include unsubscribe link
}
```

#### **Matrix Chat**
```typescript
interface MatrixMessage {
  roomType: 'direct' | 'group' | 'event';
  persistent: boolean;     // Store in chat history
  mentions: string[];      // @username notifications
  formatting: 'markdown' | 'html';
}
```

#### **SMS**
```typescript
interface SMSMessage {
  length: number;          // Character limit (160/1600)
  unicode: boolean;        // Emoji/international characters
  shortLinks: boolean;     // Compress URLs
  actionable: boolean;     // Include reply keywords like "YES/NO"
}
```

#### **Bluesky**
```typescript
interface BlueskyMessage {
  public: boolean;         // Public post vs DM
  mentions: string[];      // @handle mentions
  hashtags: string[];      // #topic hashtags
  threadable: boolean;     // Part of conversation thread
}
```

#### **WhatsApp Business**
```typescript
interface WhatsAppMessage {
  template: boolean;       // Use approved template vs freeform
  media: boolean;          // Images, documents
  interactive: boolean;    // Buttons, quick replies
  broadcast: boolean;      // One-to-many messaging
}
```

## Integration Architecture

### **Unified Messaging Service**
```typescript
interface MessagingService {
  sendMessage(message: Message, recipients: User[]): Promise<DeliveryResult[]>;
  createConversation(participants: User[], context: ConversationContext): Promise<Conversation>;
  getConversationHistory(conversationId: string, userId: string): Promise<Message[]>;
}

interface Message {
  id: string;
  type: MessageType;
  urgency: 'low' | 'normal' | 'high' | 'immediate';
  content: MessageContent;
  context: MessageContext;
  deliveryConstraints?: DeliveryConstraints;
}

interface MessageContent {
  subject?: string;        // For email, not used for SMS
  body: string;           // Core message content
  richBody?: string;      // HTML version for capable channels
  attachments?: Attachment[];
  actionButtons?: ActionButton[]; // "Approve", "Reject", etc.
}

interface DeliveryConstraints {
  channels?: MessageChannel[]; // Restrict to specific channels
  urgencyOverride?: boolean;   // Ignore user quiet hours
  requireReadReceipt?: boolean;
  expireAfter?: Date;         // Don't deliver after this time
}
```

### **Channel Adapters**
```typescript
interface ChannelAdapter {
  name: MessageChannel;
  isAvailable(user: User): Promise<boolean>;
  send(message: Message, user: User): Promise<DeliveryResult>;
  supportsFeature(feature: MessageFeature): boolean;
  adaptContent(content: MessageContent): Promise<AdaptedContent>;
}

// Feature detection per channel
enum MessageFeature {
  RichText = 'rich_text',
  Attachments = 'attachments', 
  Threading = 'threading',
  ReadReceipts = 'read_receipts',
  Encryption = 'encryption',
  GroupMessaging = 'group_messaging',
  ActionButtons = 'action_buttons',
}

// Example implementations:
class EmailAdapter implements ChannelAdapter {
  supportsFeature(feature: MessageFeature): boolean {
    return [
      MessageFeature.RichText,
      MessageFeature.Attachments,
      MessageFeature.Threading,
    ].includes(feature);
  }
}

class SMSAdapter implements ChannelAdapter {
  supportsFeature(feature: MessageFeature): boolean {
    return []; // Very limited
  }
  
  adaptContent(content: MessageContent): Promise<AdaptedContent> {
    // Strip HTML, truncate, add short links
    return {
      body: stripHtml(content.body).substring(0, 160),
      links: shortenUrls(extractUrls(content.body)),
    };
  }
}
```

## Current System Integration

### **Existing Services to Leverage**
```typescript
// Keep these, extend with channel adapters
MailService → EmailChannelAdapter
MatrixService → MatrixChannelAdapter  
BlueskyService → BlueskyChannelAdapter

// New adapters to build
SMSChannelAdapter (Twilio, AWS SNS)
WhatsAppChannelAdapter (WhatsApp Business API)
WebPlatformChannelAdapter (internal messaging)
```

### **Migration Strategy**

#### **Phase 1: Multi-Channel Foundation**
- Build `MessagingService` with channel adapter pattern
- Implement Email, Matrix, and Web Platform adapters
- Add user channel preferences
- Migrate existing email notifications to use new system

#### **Phase 2: Add External Channels**
- Implement SMS adapter (Twilio)
- Implement WhatsApp adapter
- Add Bluesky messaging (beyond just posting)
- Smart channel selection logic

#### **Phase 3: Advanced Features**
- Cross-channel conversation threading
- Message delivery analytics
- A/B testing for message effectiveness
- Rich interactive messages

## Open Design Questions

### **Multi-Channel Strategy Questions**

1. **Channel Preference Complexity**
   - Should users set preferences per message type, or have simpler "urgent vs. normal" settings?
   - How do we handle users who only want email vs. users who prefer chat apps?
   - Should groups be able to require certain channels (e.g., "SMS required for event updates")?

2. **Cross-Channel Conversations**
   - If an admin sends a group message via email, should replies go to Matrix chat or stay in email?
   - How do we handle conversations that span multiple channels?
   - Should we try to unify conversation history across channels?

3. **Channel Availability & Reliability**
   - What happens when a user's preferred channel is down (e.g., Matrix server offline)?
   - How quickly should we fall back to alternative channels?
   - Should we send important messages via multiple channels for redundancy?

4. **Privacy Across Channels**
   - Matrix provides strong privacy, SMS/email less so - how do we handle mixed preferences?
   - Should privacy settings be per-channel or global?
   - How do we warn users about privacy implications of their channel choices?

### **User Experience Questions**

5. **Channel Onboarding**
   - How do we help users understand the trade-offs between channels?
   - Should we recommend channel configurations based on their group participation?
   - How often should we prompt users to update their preferences?

6. **Message Formatting**
   - Should users compose messages once and we adapt for each channel, or let them customize per channel?
   - How do we handle rich content (images, files) for channels that don't support it?
   - Should we show previews of how messages will look in different channels?

### **Community Discussion Post**

```
🚀 Building multi-channel messaging for OpenMeet - your input needed!

We're designing a messaging system that can reach you via:
📧 Email 
💬 Matrix chat
📱 SMS
🐦 Bluesky  
📲 WhatsApp
🌐 Web platform

Key questions:

1️⃣ **Channel preferences**: Would you want different channels for different message types? 
   - Group announcements → Email
   - Urgent event updates → SMS  
   - Casual member chat → Matrix

2️⃣ **Privacy vs. convenience**: 
   - Matrix = private but requires login
   - Email/SMS = convenient but less private
   - How do you balance this?

3️⃣ **Cross-channel conversations**: 
   If admin emails the group, should replies go to:
   - Same channel (email)
   - Chat room (Matrix)  
   - Platform messaging
   - User's choice?

4️⃣ **What channels do you actually use** for group/community communication?

#OpenSource #Messaging #CommunityBuilding
```

## Implementation Roadmap

### **Phase 1: Minimal Admin Messaging (Week 1)**
*Goal: Get basic admin-to-members functionality working immediately*

#### **Deliverables**
- ✅ Group admins can email all group members  
- ✅ Event hosts can email all event attendees
- ✅ Uses existing permission system
- ✅ Simple MJML templates
- ✅ Preview functionality with test email
- ✅ Permission-based access control

#### **Current State Analysis**
- Working on `tom/add-admin-messages` branch (based on main)
- Existing mail services work well with clear patterns:
  - `MailService` - core email functionality with MJML templates
  - `GroupMailService` - handles group-related notifications  
  - `EventMailService` - handles event-related notifications
  - `GroupMemberService.getMailServiceGroupMembersByPermission()` - gets members by permission
- Templates are in `src/mail/mail-templates/` using MJML format

#### **Implementation Steps**

**Step 1: Extend GroupMailService (15 mins)**
```typescript
// Add to GroupMailService:
async sendAdminMessageToMembers(
  groupSlug: string,
  adminUserId: string, 
  subject: string,
  message: string
): Promise<AdminMessageResult>

async previewAdminMessage(
  groupSlug: string,
  adminUserId: string,
  subject: string, 
  message: string,
  testEmail: string
): Promise<void>
```

**Step 2: Extend EventMailService (15 mins)**
```typescript
// Add to EventMailService:
async sendAdminMessageToAttendees(
  eventSlug: string,
  adminUserId: string,
  subject: string, 
  message: string
): Promise<AdminMessageResult>

async previewEventMessage(
  eventSlug: string,
  adminUserId: string,
  subject: string,
  message: string, 
  testEmail: string
): Promise<void>
```

**Step 3: Extend MailService (10 mins)**
```typescript
// Add to MailService:
async sendAdminGroupMessage(mailData: MailData<AdminMessageData>): Promise<void>
async sendAdminEventMessage(mailData: MailData<AdminMessageData>): Promise<void>
```

**Step 4: Create MJML Templates (10 mins)**
```
src/mail/mail-templates/
├── group/
│   └── admin-message-to-members.mjml.ejs  # New
└── event/
    └── admin-message-to-attendees.mjml.ejs  # New
```

**Step 5: Add API Endpoints (15 mins)**
```typescript
// In GroupController:
@Post(':slug/admin-message')
@Post(':slug/admin-message/preview') 

// In EventController:
@Post(':slug/admin-message')
@Post(':slug/admin-message/preview')
```

**Step 6: Permission Checking (10 mins)**
- Use existing `SendGroupMessage` and `SendEventMessage` permissions
- Clear error messages for unauthorized users

#### **Key Design Decisions**

**What We're Building:**
- ✅ Admin can message all group members
- ✅ Admin can message all event attendees  
- ✅ Preview functionality with test email
- ✅ Permission-based access control
- ✅ Individual email delivery (Phase 1)

**What We're NOT Building (Yet):**
- ❌ BCC delivery (Phase 2)
- ❌ Rate limiting (Phase 2)
- ❌ Message approval workflow (Phase 3)
- ❌ Multi-channel delivery (Phase 4)
- ❌ User email preferences (Phase 2)

**Dependencies We'll Use:**
- Existing `GroupMemberService.getMailServiceGroupMembersByPermission()`
- Existing `EventAttendeeService` patterns
- Existing `MailService.sendMjmlMail()` functionality
- Existing permission checking patterns

#### **Expected Outcome**
After Phase 1, admins will have:
- Menu/button in group management to "Send Message to Members"
- Menu/button in event management to "Send Message to Attendees"  
- Form to compose subject and message
- Preview functionality with test email
- Actual sending to all appropriate recipients
- Success/failure feedback with delivery statistics

#### **What We Get**
- Immediate functionality for critical use cases
- Foundation that works with existing codebase
- No breaking changes to current system
- Clear path forward to more advanced features

### **Phase 2: Targeted Admin Messaging & Member Communication ✅ COMPLETED**
*Goal: Extend existing admin messaging to support specific users and add member-to-admin contact*

> **✅ IMPLEMENTATION COMPLETED**: Comprehensive admin messaging system implemented with both group and event messaging, including member-to-admin contact functionality. All features are production-ready with proper email security.

#### **✅ COMPLETED IMPLEMENTATION STATUS**

**✅ Group Admin Messaging (Fully Implemented):**
- **GroupMailService.sendAdminMessageToMembers()**: ✅ Supports targeted messaging to specific members OR all members
- **API Endpoints**: ✅ `POST /groups/:slug/admin-message` and `POST /groups/:slug/admin-message/preview`
- **Permission Checking**: ✅ Uses `GroupPermission.ManageMembers` for admin messaging
- **Email Templates**: ✅ Professional MJML templates with HTML and plain text versions
- **Delivery Tracking**: ✅ Returns `AdminMessageResult` with success/failure counts
- **Preview Functionality**: ✅ Test emails before sending to all recipients
- **Targeted Messaging**: ✅ Optional `targetUserIds` parameter for specific member selection
- **Admin Copy**: ✅ Always includes admin who sent the message

**✅ Event Admin Messaging (Fully Implemented):**
- **EventMailService.sendAdminMessageToAttendees()**: ✅ Sends to ALL event attendees
- **API Endpoints**: ✅ `POST /events/:slug/admin-message` and `POST /events/:slug/admin-message/preview`
- **Permission Checking**: ✅ Uses event organizer permissions
- **Email Templates**: ✅ Professional MJML templates with HTML and plain text versions

**✅ Member-to-Admin Contact System (Fully Implemented):**
- **GroupMailService.sendMemberContactToAdmins()**: ✅ Members can contact group admins
- **API Endpoint**: ✅ `POST /groups/:slug/contact-admins`
- **Contact Types**: ✅ 'question', 'report', 'feedback' with proper categorization
- **Email Security**: ✅ No email address leakage in templates
- **Email Templates**: ✅ MJML template with HTML and plain text versions
- **Reply Workflow**: ✅ Safe reply instructions directing to platform features

**✅ Email Security & Privacy (Fully Implemented):**
- **Plain Text Versions**: ✅ All email templates have both HTML and plain text versions
- **Email Address Protection**: ✅ No user email addresses exposed in email content
- **Safe Reply Workflow**: ✅ Contact admin emails direct to platform instead of exposing member emails
- **Template Security Audit**: ✅ All templates reviewed and secured

### **Phase 2.5: Event Attendee-to-Organizer Messaging 🚧 PLANNED**
*Goal: Enable event attendees to contact event organizers/hosts similar to group member-to-admin system*

> **📋 NEXT PRIORITY**: Implement missing reverse communication channel for events. Currently, event organizers can message attendees, but attendees cannot contact organizers.

#### **Gap Analysis: Event vs Group Messaging Parity**

**✅ What Events Have (Same as Groups):**
- **Event organizers can message ALL attendees**: `EventMailService.sendAdminMessageToAttendees()`
- **Preview functionality**: `POST /events/:slug/admin-message/preview`
- **Professional email templates**: MJML with HTML/plain text versions
- **Permission-based access**: Event organizer permissions

**❌ What Events Are Missing (Groups Have This):**
- **Attendee-to-organizer contact**: No equivalent to `GroupMailService.sendMemberContactToAdmins()`
- **Contact API endpoint**: No equivalent to `POST /groups/:slug/contact-admins`
- **Attendee contact templates**: No equivalent to `member-contact-notification.mjml.ejs`
- **Frontend UI**: No "Contact Event Organizers" button on event pages

#### **Planned Implementation: Mirror Group Pattern**

**New Backend Components:**
```typescript
// ADD: Method to EventMailService (mirror GroupMailService.sendMemberContactToAdmins)
async sendAttendeeContactToOrganizers(
  event: any,
  attendeeUserId: number,
  contactType: 'question' | 'report' | 'feedback',
  subject: string,
  message: string,
): Promise<AdminMessageResult>

// ADD: New DTO (mirror ContactAdminsDto)
export class ContactEventOrganizersDto {
  @IsNotEmpty() @IsString() @MaxLength(200) subject: string;
  @IsNotEmpty() @IsString() @MaxLength(5000) message: string;
  @IsNotEmpty() @IsIn(['question', 'report', 'feedback']) contactType: string;
}

// ADD: New endpoint to EventController
@Post(':slug/contact-organizers')
@ApiOperation({ summary: 'Send message from attendee to event organizers' })
async contactOrganizers(
  @Param('slug') slug: string,
  @Body() contactDto: ContactEventOrganizersDto,
  @AuthUser() user: User,
)
```

**New Email Template:**
```
src/mail/mail-templates/event/
└── attendee-contact-notification.mjml.ejs  # NEW - notify organizers when attendee contacts them
```

**New Frontend Components:**
```typescript
// CREATE: ContactEventOrganizersDialogComponent.vue (mirror ContactAdminsDialogComponent)
// CREATE: useContactEventOrganizersDialog.ts composable
// UPDATE: Event pages to include "Contact Organizers" button for attendees
```

#### **Implementation Strategy: Reuse Proven Patterns**

**Step 1: Backend Implementation (1.5 hours)**
- Copy `GroupMailService.sendMemberContactToAdmins()` pattern to `EventMailService`
- Copy `ContactAdminsDto` pattern to create `ContactEventOrganizersDto`
- Add `POST /events/:slug/contact-organizers` endpoint (mirror group pattern)
- Identify event organizers using existing event permission patterns

**Step 2: Email Template (30 minutes)**
- Copy `member-contact-notification.mjml.ejs` template structure
- Adapt for event context (event name, organizer roles, event-specific messaging)
- Add plain text version following established security patterns
- Ensure no email address leakage (follow group template security)

**Step 3: Frontend Implementation (2 hours)**
- Copy `ContactAdminsDialogComponent.vue` to `ContactEventOrganizersDialogComponent.vue`
- Adapt form for event context and organizer messaging
- Copy `useContactAdminsDialog.ts` pattern for event organizers
- Add "Contact Organizers" button to event pages (EventPage.vue, event sticky component)

**Step 4: Integration & Testing (1 hour)**
- Add frontend store action `actionContactEventOrganizers()` (mirror group pattern)
- Write tests copying group contact admin test patterns
- Ensure email security compliance (no email leakage, plain text versions)

#### **User Experience Flow (Mirror Group Pattern)**

**Attendee Contact Flow:**
1. Attendee visits event page
2. **NEW**: Clicks "Contact Event Organizers" button (for non-organizers)
3. **NEW**: Selects contact type (question/report/feedback) and writes message
4. **NEW**: Submits via `POST /events/:slug/contact-organizers` endpoint
5. **NEW**: All event organizers get email notification with attendee context
6. **NEW**: Organizers can reply using platform messaging features

#### **Technical Implementation Details**

**Event Organizer Identification:**
```typescript
// Reuse existing event permission patterns to find organizers
async getEventOrganizers(eventId: number): Promise<UserEntity[]> {
  // Get users with event management permissions
  // Similar to how group admins are identified in groups
}
```

**Email Template Context:**
```typescript
interface AttendeeContactNotificationData {
  event: EventEntity;           // Event context (name, slug, etc.)
  attendee: UserEntity;         // Attendee who sent message (name only, no email)
  organizers: UserEntity[];     // Event organizers receiving notification
  contactType: string;          // 'question' | 'report' | 'feedback'
  subject: string;              // Message subject
  message: string;              // Message content
  replyInstructions: string;    // Safe reply workflow (no email exposure)
}
```

#### **Security & Privacy (Same as Groups)**
- **No Email Address Exposure**: Attendee email not included in templates
- **Safe Reply Workflow**: Organizers directed to platform messaging instead of direct email
- **Plain Text Versions**: Both HTML and plain text email versions
- **Contact Type Categorization**: Proper message categorization for organizer workflow

#### **Implementation Time Estimate**
- **Total**: 5 developer hours (leveraging existing group patterns)
- **Backend**: 2 hours (EventMailService, DTO, Controller endpoint)
- **Email Template**: 0.5 hour (copy and adapt group template)
- **Frontend**: 2 hours (dialog component, integration, UI placement)
- **Testing**: 0.5 hour (copy and adapt group test patterns)

#### **Files to Create/Modify**
```
CREATE:
- src/event-mail/dto/contact-event-organizers.dto.ts
- src/mail/mail-templates/event/attendee-contact-notification.mjml.ejs
- frontend/src/components/event/ContactEventOrganizersDialogComponent.vue
- frontend/src/composables/useContactEventOrganizersDialog.ts
- frontend/src/components/event/__tests__/ContactEventOrganizersDialogComponent.vitest.spec.ts

MODIFY:
- src/event-mail/event-mail.service.ts (add sendAttendeeContactToOrganizers)
- src/event/event.controller.ts (add contact-organizers endpoint)
- src/mail/mail.service.ts (add sendAttendeeContactNotification method)
- src/mailer/mailer.service.ts (add plain text generator for attendee contact)
- frontend/src/stores/event-store.ts (add actionContactEventOrganizers)
- frontend/src/pages/EventPage.vue (add Contact Organizers button)
```

#### **Benefits of This Implementation**
- **✅ Feature Parity**: Events will have same messaging capabilities as groups
- **✅ Proven Patterns**: Reusing tested, secure code from group implementation
- **✅ Security Compliant**: Same email security standards as group messaging
- **✅ User Consistency**: Same UX patterns across groups and events
- **✅ Low Risk**: Building on working foundation with minimal new complexity

#### **Implementation Strategy - Extend Current System**

**2A. Enhanced Admin-to-Specific-Members Messaging**
```typescript
// CURRENT: GroupMailService.sendAdminMessageToMembers() 
// Sends to ALL members with GroupPermission.SeeGroup

// ENHANCEMENT: Add optional recipient filtering
async sendAdminMessageToMembers(
  group: any,
  adminUserId: number,
  subject: string,
  message: string,
  targetUserIds?: number[], // NEW - specific user targeting
): Promise<AdminMessageResult> {
  // Get admin and members info (existing code)
  const admin = await this.userService.findById(adminUserId);
  
  let members;
  if (targetUserIds && targetUserIds.length > 0) {
    // NEW: Get specific users if provided
    members = await this.groupMemberService.getSpecificGroupMembers(
      group.id, 
      targetUserIds
    );
  } else {
    // EXISTING: Get all members with permission
    members = await this.groupMemberService.getMailServiceGroupMembersByPermission(
      group.id,
      GroupPermission.SeeGroup,
    );
  }
  
  // Existing email sending logic unchanged...
}
```

**2B. Member-to-Admin Contact System (New)**
```typescript
// NEW SERVICE: Add to GroupMailService
async sendMemberContactToAdmins(
  group: any,
  memberId: number,
  contactType: 'question' | 'report' | 'feedback',
  subject: string,
  message: string,
): Promise<AdminMessageResult> {
  const member = await this.userService.findById(memberId);
  
  // Get all group admins
  const admins = await this.groupMemberService.getMailServiceGroupMembersByPermission(
    group.id,
    GroupPermission.ManageMembers, // Target group admins
  );
  
  // Send notification to all admins with member context
  for (const admin of admins) {
    await this.mailService.sendMemberContactNotification({
      to: admin.email,
      data: {
        group,
        member,
        contactType,
        subject,
        message,
        replyLink: `${tenantConfig.frontendDomain}/admin/conversations/${conversationId}`
      },
    });
  }
}
```

#### **Implementation Steps (Starting from tom/admin-to-single-user)**

**Step 1: Extend GroupMailService for Targeted Messaging (1 hour)**
```typescript
// MODIFY: src/group-mail/group-mail.service.ts
// Add optional targetUserIds parameter to existing method
async sendAdminMessageToMembers(
  group: any,
  adminUserId: number,
  subject: string,
  message: string,
  targetUserIds?: number[], // NEW PARAMETER
): Promise<AdminMessageResult>

// ADD: New method to GroupMemberService
async getSpecificGroupMembers(
  groupId: number, 
  userIds: number[]
): Promise<UserEntity[]> {
  return this.groupMemberRepository.find({
    where: {
      group: { id: groupId },
      user: { id: In(userIds) } // Check user is actually in the group
    },
    relations: ['user']
  });
}
```

**Step 2: Update DTOs for Targeted Messaging (15 minutes)**
```typescript
// MODIFY: src/group/dto/admin-message.dto.ts
export class SendAdminMessageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  subject: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  message: string;

  // NEW FIELD
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @ApiProperty({ 
    description: 'Optional array of specific user IDs to send to. If not provided, sends to all members',
    required: false 
  })
  targetUserIds?: number[];
}
```

**Step 3: Add Member Contact System (1.5 hours)**
```typescript
// ADD: src/group/dto/contact-admins.dto.ts
export class ContactAdminsDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  subject: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)  
  message: string;

  @IsNotEmpty()
  @IsIn(['question', 'report', 'feedback'])
  contactType: 'question' | 'report' | 'feedback';
}

// ADD: Method to GroupMailService
async sendMemberContactToAdmins(
  group: any,
  memberId: number,
  contactType: string,
  subject: string,
  message: string,
): Promise<AdminMessageResult>

// ADD: Endpoint to GroupController  
@Post(':slug/contact-admins')
@ApiOperation({ summary: 'Send message from member to group admins' })
async contactAdmins(
  @Param('slug') slug: string,
  @Body() contactDto: ContactAdminsDto,
  @AuthUser() user: User,
) {
  const group = await this.groupService.getGroupBySlug(slug);
  return await this.groupMailService.sendMemberContactToAdmins(
    group,
    user.id,
    contactDto.contactType,
    contactDto.subject,
    contactDto.message,
  );
}
```

**Step 4: Add Email Templates (30 minutes)**
```typescript
// ADD: src/mail/mail-templates/group/member-contact-notification.mjml.ejs
// Template for notifying admins when member contacts them

// ADD: Method to MailService
async sendMemberContactNotification(mailData: MailData<MemberContactData>): Promise<void> {
  await this.sendMjmlMail(
    mailData.to,
    'Member Message - ' + mailData.data.subject,
    'group/member-contact-notification.mjml.ejs',
    mailData.data
  );
}
```

**Step 5: Update API Endpoints (30 minutes)**
```typescript
// MODIFY: src/group/group.controller.ts
// Update existing admin message endpoint to support targetUserIds
@Post(':slug/admin-message')
async sendAdminMessage(
  @Param('slug') slug: string,
  @Body() sendAdminMessageDto: SendAdminMessageDto, // Now includes targetUserIds
  @AuthUser() user: User,
) {
  const group = await this.groupService.getGroupBySlug(slug);
  return await this.groupMailService.sendAdminMessageToMembers(
    group,
    user.id,
    sendAdminMessageDto.subject,
    sendAdminMessageDto.message,
    sendAdminMessageDto.targetUserIds, // NEW
  );
}
```

#### **User Experience Flow**

**Admin Targeted Messaging (Enhanced Existing):**
1. Admin visits group management page
2. Clicks "Send Message to Members" (existing button)
3. **NEW**: Optionally selects specific members from member list
4. Composes message using existing form
5. **ENHANCED**: Preview shows who will receive the message
6. Sends via existing `POST /:slug/admin-message` endpoint (now supports `targetUserIds`)
7. Gets delivery confirmation via existing `AdminMessageResult`

**Member Contact Flow (New):**
1. Member visits group page
2. **NEW**: Clicks "Contact Group Admins" button
3. **NEW**: Selects contact type (question/report/feedback) and writes message
4. **NEW**: Submits via `POST /:slug/contact-admins` endpoint
5. **NEW**: All group admins get email notification with member context
6. **NEW**: Admins can reply directly to member's email or via platform

#### **Key Implementation Advantages**

**Building on Proven Foundation:**
- ✅ **Existing Permission System**: Uses `GroupPermission.SendGroupMessage` for admin messaging
- ✅ **Existing Email Infrastructure**: Leverages MJML templates and MailService
- ✅ **Existing Delivery Tracking**: Uses proven `AdminMessageResult` interface
- ✅ **Existing Error Handling**: Built-in email failure tracking and duplicate prevention
- ✅ **Existing Preview System**: Test email functionality already works

**Minimal Code Changes:**
- ✅ **No Breaking Changes**: Existing API remains backward compatible
- ✅ **Optional Parameters**: `targetUserIds` is optional, defaults to all members
- ✅ **Consistent Patterns**: New member contact follows same patterns as admin messaging
- ✅ **Same Templates**: Reuse existing MJML template structure and styling

#### **Templates Needed**

**Add to existing template directory structure:**
```
src/mail/mail-templates/group/
└── member-contact-notification.mjml.ejs  # NEW - notify admins when member contacts them
```

**Template Structure (follows existing patterns):**
```html
<%- include('./../layouts/header.mjml.ejs') %>
<!-- Member contact notification to admins -->
<mj-text>
  <strong><%= member?.firstName %> <%= member?.lastName %></strong> 
  from <strong><%= group?.name %></strong> has sent you a <%= contactType %>:
</mj-text>
<mj-text font-size="18px" font-weight="bold">
  <%= subject %>
</mj-text>
<mj-text>
  <%- message.replace(/\n/g, '<br>') %>
</mj-text>
<mj-button href="mailto:<%= member?.email %>">Reply to Member</mj-button>
<%- include('./../layouts/footer.mjml.ejs') %>
```

#### **Deliverables**
- ✅ **Admin can message specific members** (extend existing `sendAdminMessageToMembers`)
- ✅ **Member can contact admins** (new `sendMemberContactToAdmins` method)
- ✅ **Professional email templates** (one new MJML template)
- ✅ **Delivery tracking** (existing `AdminMessageResult` interface)
- ✅ **Permission-based access** (existing permission system)
- ✅ **Backward compatibility** (no breaking changes to existing API)

#### **Implementation Time Estimate (tom/admin-to-single-user branch)**
- **Total**: 4 developer hours (leveraging existing infrastructure)
- **Backend Extensions**: 2.5 hours (GroupMailService, DTOs, Controller)
- **Email Template**: 0.5 hour (member contact notification)
- **Testing**: 1 hour (extend existing test patterns)

#### **Files to Modify/Create**
```
MODIFY:
- src/group-mail/group-mail.service.ts (add targetUserIds parameter)
- src/group/dto/admin-message.dto.ts (add targetUserIds field)
- src/group/group.controller.ts (update endpoint, add contact endpoint)
- src/group-member/group-member.service.ts (add getSpecificGroupMembers)
- src/mail/mail.service.ts (add sendMemberContactNotification)

CREATE:
- src/group/dto/contact-admins.dto.ts (new DTO)
- src/mail/mail-templates/group/member-contact-notification.mjml.ejs (new template)
```

#### **Risk Mitigation**
- **Very Low Risk**: Building directly on proven, working code
- **No Breaking Changes**: Optional parameters maintain backward compatibility
- **Rollback Friendly**: New features can be disabled without affecting existing functionality
- **Existing Test Coverage**: Can extend current test patterns for new functionality

### **Phase 3: Enhanced Email Features (Weeks 4-5)**
*Goal: Improve privacy, efficiency, and user experience*

#### **From mail-work Branch - Reuse**
```typescript
// These components are valuable and well-designed:
- Email templates (MJML + EJS) → src/messaging/templates/
- Template rendering service → Enhance existing MailerService  
- Audit logging concepts → Simple message logging
- Rate limiting concepts → Simple per-user limits
```

#### **From mail-work Branch - Abandon**
```typescript
// These are over-engineered for our current needs:
- Complex ModuleRef service resolution
- Circular dependency workarounds  
- Draft approval workflows
- Multi-tenant service factories
- Event-driven architecture complexity
```

#### **New Implementation**
1. **BCC Email Delivery**
   ```typescript
   // Replace individual emails with BCC for privacy
   await this.mailerService.sendMail({
     to: 'noreply@tenant.com',
     bcc: memberEmails,
     subject: `[${groupName}] ${subject}`,
     html: renderedTemplate
   });
   ```

2. **Basic Rate Limiting**
   ```typescript
   // Simple in-memory rate limiting
   @RateLimit({ maxMessages: 10, windowHours: 1 })
   async sendGroupAnnouncement() {}
   ```

3. **Message Logging**
   ```typescript
   // Simple audit trail
   interface MessageLog {
     id: string;
     senderId: string;
     recipientType: 'group' | 'event';
     recipientId: string;
     subject: string;
     sentAt: Date;
     recipientCount: number;
   }
   ```

4. **Email Preferences (Basic)**
   ```typescript
   interface UserEmailPrefs {
     groupAnnouncements: 'immediate' | 'digest' | 'disabled';
     eventUpdates: 'immediate' | 'disabled';
   }
   ```

#### **Deliverables**
- ✅ BCC delivery for privacy protection
- ✅ Basic rate limiting (10 messages/hour per user)
- ✅ Message audit logging
- ✅ User email preferences (on/off per type)
- ✅ Unsubscribe links in emails

### **Phase 4: Platform Messaging Foundation (Weeks 6-8)**
*Goal: Add in-platform messaging for sensitive conversations*

#### **Core Infrastructure**
1. **Conversation System**
   ```typescript
   interface Conversation {
     id: string;
     type: 'direct_message' | 'admin_contact' | 'application_review';
     participants: string[];
     context: { groupId?: string; eventId?: string };
     messages: Message[];
     status: 'active' | 'resolved';
   }
   ```

2. **Web Messaging Interface**
   - Conversation list page
   - Message thread interface  
   - Real-time updates (WebSocket)
   - File attachments

3. **Email Notifications for Platform Messages**
   ```typescript
   // Email drives users to platform for replies
   "New message from John about your group application.
   Click here to reply: [View Message]"
   ```

#### **Privacy-Protected Messaging**
- All sensitive conversations happen in platform
- Email notifications only (no direct email replies)
- Complete conversation history
- Moderation capabilities

#### **Deliverables**
- ✅ In-platform messaging system
- ✅ Email notifications drive to platform
- ✅ Group application vetting conversations
- ✅ Member-to-admin contact system
- ✅ Basic moderation tools

### **Phase 4: Multi-Channel Integration (Weeks 7-10)**
*Goal: Integrate Matrix, SMS, and other channels*

#### **Channel Adapter Architecture**
```typescript
interface ChannelAdapter {
  send(message: Message, user: User): Promise<DeliveryResult>;
  supportsFeature(feature: MessageFeature): boolean;
  adaptContent(content: MessageContent): Promise<AdaptedContent>;
}

// Implementations:
- EmailChannelAdapter (enhance existing)
- MatrixChannelAdapter (integrate existing Matrix service)
- SMSChannelAdapter (new - Twilio integration)
- WebPlatformChannelAdapter (from Phase 3)
```

#### **User Channel Preferences**
```typescript
interface ChannelPreferences {
  groupAnnouncements: 'email' | 'matrix' | 'both';
  eventUpdates: 'email' | 'sms' | 'both';
  directMessages: 'platform' | 'matrix';
  urgentNotifications: 'sms' | 'email';
}
```

#### **Smart Message Routing**
- Automatic channel selection based on user preferences
- Fallback mechanisms when channels unavailable
- Content adaptation per channel capabilities

#### **Deliverables**
- ✅ Unified messaging service with channel adapters
- ✅ SMS integration for urgent notifications
- ✅ Matrix chat integration for group messaging
- ✅ User channel preference interface
- ✅ Cross-channel message routing

### **Phase 5: Advanced Features (Weeks 11-14)**
*Goal: Rich messaging features and optimizations*

#### **Advanced Channel Features**
1. **WhatsApp Business Integration**
   - Template message approval
   - Rich media support
   - Interactive buttons

2. **Bluesky Messaging**
   - Direct messages via AT Protocol
   - Public announcements as posts
   - Community hashtag integration

3. **Enhanced Matrix Integration**
   - Automatic room creation for groups/events
   - Bridge conversations between Matrix and platform
   - Rich message formatting

#### **Advanced User Experience**
1. **Message Scheduling**
   ```typescript
   interface ScheduledMessage {
     sendAt: Date;
     timezone: string;
     recurring: boolean;
   }
   ```

2. **Message Templates**
   ```typescript
   // Admin-defined templates for common messages
   interface MessageTemplate {
     name: string;
     subject: string;
     body: string;
     variables: string[]; // {{eventName}}, {{date}}
   }
   ```

3. **Delivery Analytics**
   - Open rates, click rates per channel
   - A/B testing for message effectiveness
   - Channel performance insights

#### **Deliverables**
- ✅ WhatsApp Business API integration
- ✅ Enhanced Bluesky messaging
- ✅ Advanced Matrix features
- ✅ Message scheduling and templates
- ✅ Delivery analytics dashboard

### **Phase 6: Enterprise Features (Weeks 15-18)**
*Goal: Scalability, compliance, and advanced administration*

#### **Scale and Reliability**
1. **Queue-Based Message Delivery**
   - RabbitMQ integration for reliable delivery
   - Retry mechanisms for failed messages
   - Dead letter queues for problem messages

2. **Advanced Rate Limiting**
   - Redis-based rate limiting
   - Different limits per user role
   - Tenant-level messaging quotas

3. **Delivery Optimization**
   - Batch processing for large groups
   - Geographic message routing
   - Channel load balancing

#### **Compliance and Moderation**
1. **Message Moderation**
   - Content filtering (spam, inappropriate content)
   - Admin review queues
   - Automated flagging systems

2. **Compliance Features**
   - Message retention policies
   - Export capabilities for legal requests
   - GDPR compliance tools

3. **Advanced Privacy**
   - End-to-end encryption options
   - Message expiration
   - Anonymous messaging modes

#### **Deliverables**
- ✅ Production-scale message processing
- ✅ Comprehensive moderation tools
- ✅ Compliance and privacy features
- ✅ Advanced administrative controls

## **Decision Points and Evaluation Criteria**

### **Phase 1 → Phase 2 Decision**
*Evaluate after Phase 1 completion:*
- User adoption of admin messaging features
- Performance of individual email delivery
- User feedback on email privacy concerns
- Technical debt from rapid implementation

**Go/No-Go Criteria:**
- ✅ >50% of active groups use admin messaging within 2 weeks
- ✅ <5% user complaints about email privacy
- ✅ No performance issues with current approach
- ❌ Stop if users don't adopt or technical problems arise

### **Phase 3 → Phase 4 Decision**  
*Evaluate after Phase 3 completion:*
- Platform messaging adoption rates
- User demand for alternative channels (SMS, Matrix)
- Technical complexity vs. user value
- Community feedback on multi-channel preferences

**Go/No-Go Criteria:**
- ✅ >30% of sensitive conversations use platform messaging
- ✅ Clear user demand for specific additional channels
- ✅ Technical architecture proves sustainable
- ❌ Pause if platform messaging doesn't gain traction

### **Ongoing Evaluation Metrics**
- **User Engagement**: Message open rates, reply rates, platform usage
- **Technical Performance**: Delivery success rates, response times
- **User Satisfaction**: Feedback surveys, support ticket volume
- **Business Impact**: Group retention, event attendance correlation

## **Resource Requirements**

### **Development Time Estimates**
- **Phase 1**: 1 developer-week (immediate value)
- **Phase 2**: 2 developer-weeks (significant UX improvement)  
- **Phase 3**: 3 developer-weeks (major new capability)
- **Phase 4**: 4 developer-weeks (complex integration work)
- **Phase 5**: 3 developer-weeks (polish and optimization)
- **Phase 6**: 4 developer-weeks (enterprise features)

### **Infrastructure Costs**
- **Phase 1-2**: $0 additional (uses existing email)
- **Phase 3**: $20-50/month (database, storage)
- **Phase 4**: $100-300/month (SMS, WhatsApp APIs)
- **Phase 5**: $200-500/month (advanced channel features)
- **Phase 6**: $500-1000/month (enterprise infrastructure)

### **External Dependencies**
- **Phase 1-3**: None (uses existing services)
- **Phase 4**: Twilio (SMS), WhatsApp Business API
- **Phase 5**: Additional API providers as needed
- **Phase 6**: Message queue infrastructure (RabbitMQ/Redis)

---

## Community Feedback

*This section will be updated as we collect responses from the community.*

### **Channel Usage Patterns**
*To be filled in...*

### **Privacy vs. Convenience Trade-offs**  
*To be filled in...*

### **Cross-Channel Conversation Preferences**
*To be filled in...*

### **Integration Requests**
*To be filled in...*