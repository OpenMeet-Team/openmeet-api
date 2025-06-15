# Messaging System Design Document

## Overview

This document defines the requirements, architecture, and design decisions for OpenMeet's unified messaging system. The goal is to enable various types of communication between users across multiple channels while maintaining privacy, preventing abuse, and providing a good user experience.

## 🎯 Current Implementation Status (May 2025)

### ✅ **Fully Implemented & Production Ready**
- **Group Admin Messaging**: Complete admin-to-member messaging with targeted user selection
- **Event Admin Messaging**: Complete organizer-to-attendee messaging 
- **Member-to-Admin Contact**: Complete member-to-admin contact system for groups
- **Event Attendee-to-Organizer Contact**: ✅ **NEWLY IMPLEMENTED** - Complete reverse communication for events
- **Email Security**: All templates secured with no email address leakage, HTML + plain text versions
- **Preview Functionality**: Test emails before sending to recipients
- **Delivery Tracking**: Success/failure counts and comprehensive error handling
- **Permission-Based Access**: Secure role-based messaging controls
- **Comprehensive Test Coverage**: All messaging features tested with timeout-resistant test suites

### 🚨 **CRITICAL: Permission Architecture Refactor Required**
**Current Problem**: `ManageMembers` permission incorrectly used for messaging functionality, creating architectural confusion between membership management and communication permissions.

**Root Cause**: During rapid development, `ManageMembers` was used as a proxy for "admin-level users who can message members" but this conflates two distinct concerns.

**Impact**: 
- Backend endpoints use `ManageMembers` for `admin-message` functionality (lines 317, 343 in group.controller.ts)
- Frontend UI shows messaging buttons based on membership management permissions
- Violates separation of concerns principle
- Creates technical debt and confusion for future development
- Makes it difficult to grant messaging permissions independently of membership management

### 🎯 **Required Permission Architecture Changes**
**New Permission Model**:
```typescript
// Separate permissions for distinct concerns:
ManageMembers = 'MANAGE_MEMBERS'      // Add/remove/approve members, change roles
ContactMembers = 'CONTACT_MEMBERS'    // Send broadcast messages to group members  
ContactAdmins = 'CONTACT_ADMINS'      // Send escalation messages to group leadership
MessageDiscussion = 'MESSAGE_DISCUSSION' // Post in group discussion/chat rooms (existing)
```

**Migration Strategy**: See `/design-notes/permissions-refactor-messaging.md` for detailed migration plan ensuring zero production downtime.

### 🔄 **Current Messaging Flow Coverage**
```
✅ Group Admin → Group Members (with targeting)
✅ Group Members → Group Admins (secure contact system)
✅ Event Organizers → Event Attendees  
✅ Event Attendees → Event Organizers (NEWLY COMPLETED)
✅ System → All Users (transactional emails)
✅ Member ↔ Member (Matrix chat)
```

### 📊 **Feature Parity Achievement**
**✅ COMPLETE PARITY**: Events and Groups now have identical messaging capabilities:
- **Admin/Organizer → Members/Attendees**: Both implemented
- **Member/Attendee → Admin/Organizer**: Both implemented  
- **Preview & Delivery Tracking**: Both implemented
- **Email Security Standards**: Both implemented
- **Permission-Based Access**: Both implemented

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

### **Phase 2.5: Event Attendee-to-Organizer Messaging ✅ COMPLETED**
*Goal: Enable event attendees to contact event organizers/hosts similar to group member-to-admin system*

> **✅ COMPLETED**: Reverse communication channel for events successfully implemented. Events now have full messaging parity with groups.

#### **✅ Implementation Achievement: Complete Event-Group Messaging Parity**

**✅ What We Successfully Implemented:**

**Backend Infrastructure:**
- **EventMailService.sendAttendeeContactToOrganizers()**: ✅ Full implementation mirroring group pattern
- **ContactOrganizersDto**: ✅ Validation DTO with contact types ('question', 'report', 'feedback')
- **POST /events/:slug/contact-organizers**: ✅ API endpoint with proper authentication and validation
- **Email Templates**: ✅ Professional MJML template with HTML and plain text versions
- **Permission-Based Access**: ✅ Proper attendee verification and organizer targeting
- **Delivery Tracking**: ✅ Full AdminMessageResult with success/failure counts

**Frontend Implementation:**
- **ContactEventOrganizersDialogComponent.vue**: ✅ Complete form with validation and error handling
- **useContactEventOrganizersDialog.ts**: ✅ Composable for dialog management
- **Event Store Integration**: ✅ actionContactOrganizers() method with analytics tracking
- **Event Page Integration**: ✅ "Contact Organizers" button for attendees (not organizers)
- **API Integration**: ✅ Complete events API with proper TypeScript types

**Security & Quality:**
- **Email Security**: ✅ No email address leakage, safe reply workflows
- **Plain Text Support**: ✅ Accessibility-compliant email versions  
- **Comprehensive Testing**: ✅ Full e2e test suite with timeout handling
- **Permission UI Logic**: ✅ Button only shows for attendees who aren't organizers

**✅ Events Now Have Complete Parity With Groups:**
- **Organizer → Attendees**: Both have admin messaging ✅
- **Attendee/Member → Organizer/Admin**: Both have contact systems ✅  
- **Email Templates**: Both have professional MJML templates ✅
- **Security Standards**: Both follow same email security patterns ✅
- **Frontend UX**: Both have consistent dialog and button patterns ✅

#### **Actual Implementation Results (5 hours total)**

**✅ Successfully Completed All Planned Work:**
- **Backend**: EventMailService.sendAttendeeContactToOrganizers(), ContactOrganizersDto, API endpoint
- **Email Template**: attendee-contact-notification.mjml.ejs with HTML/plain text versions
- **Frontend**: ContactEventOrganizersDialogComponent.vue, composable, store integration
- **UI Integration**: "Contact Organizers" button properly placed on event pages
- **Testing**: Comprehensive e2e test suite with timeout handling
- **Security**: Full email security compliance with no address leakage

### **🚀 NEXT PHASE: Architectural Refactoring & Code Quality (Phase 3)**
*Goal: Consolidate patterns, improve maintainability, and prepare for advanced features*

> **📋 CURRENT STATE ANALYSIS**: We now have complete messaging functionality but with some technical debt from rapid implementation. Time to consolidate and create a more robust foundation.

#### **🎯 Strategic Goals for Phase 3**

**1. Code Consolidation & DRY Principles**
- Eliminate duplicate patterns between GroupMailService and EventMailService
- Create unified messaging abstractions
- Reduce code duplication in frontend components
- Standardize error handling and validation patterns

**2. Improved Architecture**
- Introduce unified MessagingService layer
- Create reusable MessageTemplate system  
- Implement proper separation of concerns
- Add proper dependency injection patterns

**3. Enhanced Developer Experience**
- Clear interfaces and contracts
- Better TypeScript types and generics
- Improved test utilities and patterns
- Comprehensive documentation

**4. Performance & Scalability Preparation**
- Optimize email delivery patterns
- Add caching for template rendering
- Prepare for batch processing
- Implement proper error recovery

#### **📊 Current Technical Debt Analysis**

**Backend Duplication Issues:**
```typescript
// PROBLEM: Nearly identical code in two services
GroupMailService.sendMemberContactToAdmins()   // 95% same logic
EventMailService.sendAttendeeContactToOrganizers()  // 95% same logic

GroupMailService.sendAdminMessageToMembers()   // 90% same logic  
EventMailService.sendAdminMessageToAttendees()    // 90% same logic
```

**Frontend Pattern Repetition:**
```typescript
// PROBLEM: Copy-paste components with minimal differences
ContactAdminsDialogComponent.vue          // Group version
ContactEventOrganizersDialogComponent.vue    // Event version - 95% identical

useContactAdminsDialog.ts                 // Group version
useContactEventOrganizersDialog.ts           // Event version - 95% identical
```

**Email Template Duplication:**
```html
<!-- PROBLEM: Nearly identical templates -->
group/member-contact-notification.mjml.ejs    <!-- Group version -->
event/attendee-contact-notification.mjml.ejs  <!-- Event version - 90% same -->
```

#### **🏗️ Proposed Unified Architecture**

**1. Universal Messaging Service**
```typescript
// NEW: Unified service that handles both groups and events
export class UniversalMessagingService {
  // Replace both GroupMailService and EventMailService methods
  async sendContactMessage<T extends GroupEntity | EventEntity>(
    context: MessagingContext<T>,
    sender: UserEntity,
    recipients: UserEntity[],
    contactData: ContactMessageData
  ): Promise<AdminMessageResult>

  async sendAdminMessage<T extends GroupEntity | EventEntity>(
    context: MessagingContext<T>,
    admin: UserEntity,
    recipients: UserEntity[],
    messageData: AdminMessageData
  ): Promise<AdminMessageResult>
}

interface MessagingContext<T> {
  entity: T;  // GroupEntity | EventEntity
  type: 'group' | 'event';
  getAdmins(): Promise<UserEntity[]>;
  getMembers(): Promise<UserEntity[]>;
  getPermissionName(): string;
}
```

**2. Unified Frontend Components**
```typescript
// NEW: Generic contact dialog that works for both groups and events
<ContactEntityDialog 
  :entity="group|event"
  :entity-type="'group'|'event'"
  :contact-action="contactAction"
/>

// NEW: Generic composable
export function useContactEntityDialog<T extends 'group' | 'event'>() {
  const showContactDialog = (entity: EntityType<T>) => { /* unified logic */ }
}
```

**3. Template System Refactoring**
```typescript
// NEW: Template inheritance and composition
interface EmailTemplateContext {
  entity: GroupEntity | EventEntity;
  entityType: 'group' | 'event';
  sender: UserEntity;
  recipients: UserEntity[];
  messageData: ContactMessageData | AdminMessageData;
}

// Base template with shared layout
contact-notification-base.mjml.ejs
├── entity-specific-header.mjml.ejs   // Group vs Event differences
├── shared-message-body.mjml.ejs      // Common message content
└── entity-specific-footer.mjml.ejs   // Group vs Event differences
```

#### **🎢 Implementation Strategy: Gradual Migration**

**Phase 3.1: Backend Unification (Week 1)**
```typescript
// STEP 1: Create unified messaging interfaces
interface ContactMessageUseCase {
  execute(context: MessagingContext, data: ContactMessageData): Promise<AdminMessageResult>;
}

interface AdminMessageUseCase {
  execute(context: MessagingContext, data: AdminMessageData): Promise<AdminMessageResult>;
}

// STEP 2: Create adapters for existing services
class GroupMessagingAdapter implements MessagingContext<GroupEntity> {
  constructor(private groupService: GroupService, private groupMemberService: GroupMemberService) {}
  
  async getAdmins(): Promise<UserEntity[]> {
    return this.groupMemberService.getMailServiceGroupMembersByPermission(
      this.entity.id, 
      GroupPermission.ManageMembers
    );
  }
}

class EventMessagingAdapter implements MessagingContext<EventEntity> {
  constructor(private eventService: EventService, private eventAttendeeService: EventAttendeeService) {}
  
  async getAdmins(): Promise<UserEntity[]> {
    return this.eventAttendeeService.getMailServiceEventAttendeesByPermission(
      this.entity.id,
      EventAttendeePermission.ManageEvent
    );
  }
}

// STEP 3: Unified service implementation
class UniversalMessagingService {
  async sendContactMessage<T>(
    context: MessagingContext<T>,
    sender: UserEntity,
    data: ContactMessageData
  ): Promise<AdminMessageResult> {
    const admins = await context.getAdmins();
    // Unified email sending logic
    return this.deliverEmails(context, sender, admins, data);
  }
}
```

**Phase 3.2: Frontend Consolidation (Week 2)**  
```typescript
// STEP 1: Create generic contact dialog
<template>
  <q-dialog ref="dialogRef" @hide="onDialogHide" persistent>
    <q-card style="min-width: 600px; max-width: 800px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Contact {{ entityDisplayName }}</div>
        <!-- ... rest of unified template ... -->
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts" generic="T extends 'group' | 'event'">
interface Props {
  entity: EntityType<T>
  entityType: T
}

const props = defineProps<Props>()

// Unified logic that adapts based on entityType
const entityDisplayName = computed(() => 
  props.entityType === 'group' ? 'Group Admins' : 'Event Organizers'
)

const contactAction = computed(() =>
  props.entityType === 'group' 
    ? () => groupStore.actionContactAdmins(/* ... */)
    : () => eventStore.actionContactOrganizers(/* ... */)
)
</script>
```

**Phase 3.3: Template Unification (Week 2)**
```html
<!-- NEW: Unified base template -->
<%- include('./../layouts/header.mjml.ejs') %>

<!-- Dynamic header based on entity type -->
<% if (entityType === 'group') { %>
  <%- include('./partials/group-contact-header.mjml.ejs') %>
<% } else { %>
  <%- include('./partials/event-contact-header.mjml.ejs') %>
<% } %>

<!-- Shared message content -->
<%- include('./partials/shared-message-content.mjml.ejs') %>

<!-- Dynamic footer based on entity type -->
<% if (entityType === 'group') { %>
  <%- include('./partials/group-contact-footer.mjml.ejs') %>
<% } else { %>
  <%- include('./partials/event-contact-footer.mjml.ejs') %>
<% } %>

<%- include('./../layouts/footer.mjml.ejs') %>
```

#### **🎯 Expected Benefits After Phase 3**

**Code Quality Improvements:**
- **50% reduction in duplicated code** between group and event messaging
- **Unified testing patterns** with shared test utilities
- **Consistent error handling** across all messaging features
- **Improved TypeScript safety** with proper generics and constraints

**Developer Experience:**
- **Single source of truth** for messaging logic
- **Easier feature additions** (new entity types, new message types)
- **Better maintainability** with clear separation of concerns  
- **Comprehensive documentation** with architectural decision records

**Performance & Scalability:**
- **Optimized email delivery** with unified batching logic
- **Template caching** for improved rendering performance
- **Proper error recovery** with unified retry mechanisms
- **Foundation for advanced features** (message queues, analytics, etc.)

**User Experience:**
- **Consistent UX patterns** across all messaging features
- **Faster load times** with optimized components
- **Better error messages** with unified error handling
- **Smoother interactions** with improved validation

#### **📋 Implementation Roadmap**

**Week 1: Backend Architecture**
- Create messaging interfaces and adapters (16 hours)
- Implement UniversalMessagingService (12 hours)  
- Write migration tests ensuring no functionality regression (8 hours)
- Update API controllers to use new service (4 hours)

**Week 2: Frontend & Templates**
- Create unified contact dialog component (12 hours)
- Refactor existing pages to use new component (8 hours)
- Unify email templates with composition pattern (8 hours)
- Comprehensive testing of unified components (8 hours)

**Week 3: Documentation & Polish**
- Write architectural documentation (8 hours)
- Create developer guide for adding new entity types (4 hours)
- Performance testing and optimization (8 hours)
- Code review and final refinements (8 hours)

#### **🔄 Migration Strategy: Zero Downtime**

**Backward Compatibility:**
- Keep existing services operational during migration
- Feature flags for gradual rollout of new architecture
- Comprehensive testing in staging before production deployment
- Ability to rollback to previous implementation if needed

**Quality Assurance:**
- All existing tests must pass with new implementation
- New unified tests to cover edge cases
- Performance benchmarks to ensure no regression
- Manual testing of all user flows

**Risk Mitigation:**
- Incremental deployment with feature flags
- Monitoring and alerting for any issues
- Quick rollback procedures if problems arise
- Team training on new architecture patterns

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

## Architecture Research Questions

*These questions will help inform our technical and UX decisions for the unified messaging system.*

### **Channel Strategy & User Behavior**

1. **Primary Communication Channels**
   - What messaging platforms do you currently use for community/group organization? (Email, Discord, Slack, WhatsApp, SMS, etc.)
   - Which channels do you check most frequently throughout the day?
   - How do you prefer to receive urgent notifications vs. regular updates?

2. **Multi-Channel Preferences**
   - Would you prefer different channels for different types of messages? (e.g., urgent event updates via SMS, general announcements via email)
   - How many notification channels is too many? What's the sweet spot?
   - Do you prefer consolidated notifications (one email with everything) or separate notifications per topic?

3. **Privacy vs. Convenience Balance**
   - How important is it that other members can't see your email address/phone number?
   - Would you trade some privacy for more convenient communication (e.g., direct replies)?
   - Are you comfortable with email threads that include multiple group members?

### **User Experience & Workflow**

4. **Message Composition & Formatting**
   - Should admins compose one message that adapts to each channel, or customize per channel?
   - How important are rich formatting features (bold, links, images) in group communications?
   - Would you want message previews showing how they'll appear in different channels?

5. **Cross-Channel Conversations**
   - If an admin emails the group, where should member replies go? (Same channel, chat room, platform, member's choice)
   - How do you handle conversations that start in one channel but need to continue elsewhere?
   - Should conversation history be unified across channels or kept separate?

6. **Notification Management**
   - How do you currently manage notification overload from multiple groups/events?
   - Would you want quiet hours settings? Time zone considerations?
   - Should there be different urgency levels (immediate, normal, digest)?

### **Technical Architecture & Scalability**

7. **Channel Reliability & Fallbacks**
   - What should happen when your preferred channel is unavailable? (Auto-fallback, wait, skip)
   - How quickly should the system try alternative channels?
   - For critical messages, would you want redundant delivery across multiple channels?

8. **Group Size & Performance**
   - At what group size do messaging patterns change? (10 members vs 100 vs 1000)
   - How do expectations differ between small intimate groups and large communities?
   - What messaging features become more/less important as groups grow?

9. **Integration & Interoperability**
   - Should the system integrate with existing tools (Google Calendar, Slack workspaces, Discord servers)?
   - How important is import/export of conversation history?
   - Would you want two-way sync with external platforms?

### **Community Management & Moderation**

10. **Admin Control & Moderation**
    - What level of message moderation do you expect in community platforms?
    - Should there be approval workflows for certain types of messages?
    - How should spam and inappropriate content be handled across different channels?

11. **Member Permissions & Roles**
    - Should different member types have different messaging privileges?
    - How granular should message-sending permissions be?
    - Should new members have restricted messaging until verified?

12. **Analytics & Insights**
    - What messaging analytics would be valuable for community organizers?
    - Should there be delivery/read receipts across channels?
    - How important is A/B testing for message effectiveness?

### **Platform-Specific Questions**

13. **Matrix Integration**
    - Are you familiar with Matrix for community chat?
    - How important is end-to-end encryption for community communications?
    - Would you prefer Matrix rooms or traditional forums for group discussions?

14. **Social Media Integration**
    - Should group announcements automatically post to social platforms (Bluesky, Twitter)?
    - How do you balance public visibility with member privacy?
    - Would you want social media replies to feed back into group conversations?

15. **Mobile & Real-Time Features**
    - How important are push notifications vs. email for different message types?
    - Should there be real-time chat features or is async communication sufficient?
    - What mobile messaging behaviors should we accommodate?

### **Implementation Priorities**

16. **Feature Importance Ranking**
    - Rank these features by importance: multi-channel delivery, rich formatting, conversation threading, message scheduling, delivery analytics, end-to-end encryption
    - Which features are "must-have" vs "nice-to-have" for your use cases?
    - What would make you switch from your current messaging solution?

17. **Rollout Strategy**
    - Would you prefer gradual feature rollout or complete implementation before launch?
    - How important is backward compatibility with existing workflows?
    - What level of migration assistance would you need from current tools?

### **Open-Ended Feedback**

18. **Current Pain Points**
    - What frustrates you most about current community/group messaging tools?
    - Describe a recent situation where group communication broke down - what went wrong?
    - What messaging features do you wish existed but haven't seen implemented well?

19. **Ideal Future State**
    - If you could design the perfect community messaging system, what would it look like?
    - How should messaging evolve as communities grow and mature?
    - What would make group communication feel effortless and natural?

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

---

## **Phase 2.7: Event Email Announcements & Reminder System ⚠️ PLANNED**
*Goal: Add tenant-aware automated email notifications for new event announcements and attendee reminders*

> **📋 STRATEGIC ADDITION**: Building on the successful completion of admin messaging and member contact systems, we're extending the email infrastructure to support automated notifications and scheduled reminders with full multi-tenant isolation.

### **🎯 Feature Requirements**

#### **1. Group Event Announcement Emails**
**Trigger**: When an event is published in a group (tenant-scoped)
**Recipients**: All group members within the same tenant (excluding event creator)
**Content**: Event details, registration link, group context with tenant branding
**Integration**: Extend existing tenant-aware event-driven architecture

#### **2. Event Reminder System**
**Day-Before Reminders**: 24 hours before event start time (tenant timezone-aware)
**Pre-Event Reminders**: 15-30 minutes before event start time (tenant timezone-aware)
**Recipients**: Only confirmed attendees within tenant with valid email preferences
**Scheduling**: Tenant-isolated job queue system for precise timing

#### **3. User Email Notification Preferences**
**Location**: Extend existing ProfilePage.vue email notification section
**Granular Control**: Per-notification-type settings with master switch
**Integration**: Extend existing tenant-scoped `preferences` JSONB column

### **📧 Email Notification Preferences Structure**

```typescript
// Extend existing UserEntity preferences (tenant-scoped)
preferences: {
  emailNotifications?: {
    // Master control
    enabled?: boolean;                    // Global on/off switch
    
    // Event-related notifications  
    newEventNotifications?: boolean;      // New events published in my groups
    eventReminders?: {
      dayBefore?: boolean;               // 24 hours before event
      justBefore?: boolean;              // 15-30 minutes before event
    };
    
    // Existing notifications (give users control)
    eventUpdates?: boolean;              // Event changes, cancellations
    groupUpdates?: boolean;              // Role changes, admin messages  
    chatMessages?: boolean;              // New chat message notifications
  };
  
  // Existing tenant-scoped preferences remain unchanged
  bluesky?: { /* ... */ };
  matrix?: { /* ... */ };
}
```

### **🏗️ Technical Architecture (Tenant-Aware)**

#### **Event-Driven Email Announcements**
```typescript
// NEW: Tenant-aware event listener for published events
@EventListener('event.published')
async handleEventPublished(event: EventPublishedEvent) {
  // Ensure tenant context is maintained
  const tenantId = event.tenantId;
  
  const group = await this.groupService.findByIdAndTenant(event.groupId, tenantId);
  const groupMembers = await this.getEligibleMembersByTenant(
    group.id, 
    tenantId, 
    event.creatorId
  );
  
  await this.groupMailService.sendNewEventAnnouncement({
    event: event.event,
    group: group,
    recipients: groupMembers,
    tenantId: tenantId  // Explicit tenant context
  });
}

// Extend existing GroupMailService with tenant awareness
async sendNewEventAnnouncement(data: EventAnnouncementData): Promise<AdminMessageResult> {
  // Validate all entities belong to same tenant
  this.validateTenantConsistency(data.tenantId, data.event, data.group, data.recipients);
  
  // Use tenant-specific email configuration
  const tenantConfig = await this.tenantConfigService.getConfigByTenantId(data.tenantId);
  
  // Filter recipients by email preferences (tenant-scoped)
  const eligibleRecipients = await this.filterByEmailPreferences(
    data.recipients, 
    'newEventNotifications',
    data.tenantId
  );
  
  // Send via existing tenant-aware mail infrastructure
  return this.sendTenantEmail(tenantConfig, data, eligibleRecipients);
}
```

#### **Tenant-Isolated Job Queue System**
```typescript
// NEW: Tenant-aware job queue service for reliable scheduling
@Injectable()
export class EventReminderScheduler {
  private reminderQueue: Queue;
  
  constructor(
    private elasticacheService: ElastiCacheService,
    private tenantService: TenantService
  ) {
    // Use existing Valkey/Redis connection with tenant isolation
    this.reminderQueue = new Queue('event-reminders', {
      connection: this.elasticacheService.getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        // Include tenant context in all jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        }
      }
    });
  }
  
  async scheduleEventReminders(event: EventEntity, tenantId: string) {
    // Validate event belongs to tenant
    if (event.tenantId !== tenantId) {
      throw new ForbiddenException('Event does not belong to tenant');
    }
    
    // Get tenant timezone for accurate scheduling
    const tenantConfig = await this.tenantService.getConfig(tenantId);
    const tenantTimezone = tenantConfig.timezone || 'UTC';
    
    const reminders = [
      { 
        delay: event.startTime.getTime() - Date.now() - (24 * 60 * 60 * 1000),
        type: 'day-before' 
      },
      { 
        delay: event.startTime.getTime() - Date.now() - (30 * 60 * 1000),
        type: 'just-before' 
      }
    ];

    for (const reminder of reminders) {
      if (reminder.delay > 0) {
        await this.reminderQueue.add('send-reminder', {
          eventSlug: event.slug,
          tenantId: tenantId,           // Explicit tenant isolation
          reminderType: reminder.type,
          timezone: tenantTimezone
        }, { 
          delay: reminder.delay,
          // Tenant-specific job ID to prevent cross-tenant conflicts
          jobId: `${tenantId}:${event.slug}:${reminder.type}`
        });
      }
    }
  }
  
  // Tenant-aware reminder cancellation
  async cancelEventReminders(eventSlug: string, tenantId: string) {
    const jobs = await this.reminderQueue.getJobs(['delayed']);
    for (const job of jobs) {
      // Only cancel jobs for the specific tenant
      if (job.data.tenantId === tenantId && job.data.eventSlug === eventSlug) {
        await job.remove();
      }
    }
  }
}

// NEW: Tenant-aware job processor for reminder delivery
@Process('send-reminder')
async processReminderJob(job: Job<ReminderJobData>) {
  const { eventSlug, tenantId, reminderType } = job.data;
  
  // Ensure tenant context throughout processing
  const event = await this.eventService.findBySlugAndTenant(eventSlug, tenantId);
  if (!event) {
    throw new NotFoundException(`Event ${eventSlug} not found in tenant ${tenantId}`);
  }
  
  const attendees = await this.getEligibleAttendeesByTenant(
    event.id, 
    tenantId, 
    reminderType
  );
  
  await this.eventMailService.sendEventReminder({
    event: event,
    attendees: attendees,
    reminderType: reminderType,
    tenantId: tenantId  // Maintain tenant context
  });
}
```

#### **Tenant-Aware Email Infrastructure Integration**
```typescript
// Extend existing EventMailService with tenant isolation
async sendEventReminder(data: EventReminderData): Promise<AdminMessageResult> {
  // Validate tenant consistency
  this.validateTenantConsistency(data.tenantId, data.event, data.attendees);
  
  // Get tenant-specific email configuration
  const tenantConfig = await this.tenantConfigService.getConfigByTenantId(data.tenantId);
  
  const template = data.reminderType === 'day-before' 
    ? 'event/reminder-24h.mjml.ejs'
    : 'event/reminder-30m.mjml.ejs';
    
  // Filter by user email preferences (tenant-scoped)
  const eligibleAttendees = await this.filterAttendeesWithReminderPreference(
    data.attendees, 
    data.reminderType,
    data.tenantId
  );
  
  // Use tenant-aware email delivery infrastructure
  return this.sendTenantBulkEventEmail(
    template, 
    data.event, 
    eligibleAttendees, 
    tenantConfig
  );
}

// NEW: Tenant-aware email preference checking
private async userHasReminderPreference(
  user: UserEntity, 
  reminderType: string,
  tenantId: string
): Promise<boolean> {
  // Ensure user belongs to tenant
  if (user.tenantId !== tenantId) {
    return false;
  }
  
  const prefs = user.preferences?.emailNotifications;
  
  if (!prefs?.enabled) return false;
  
  return reminderType === 'day-before' 
    ? prefs.eventReminders?.dayBefore !== false
    : prefs.eventReminders?.justBefore !== false;
}

// Tenant validation utility
private validateTenantConsistency(tenantId: string, ...entities: any[]) {
  for (const entity of entities) {
    if (Array.isArray(entity)) {
      entity.forEach(item => {
        if (item.tenantId && item.tenantId !== tenantId) {
          throw new ForbiddenException('Cross-tenant operation not allowed');
        }
      });
    } else if (entity.tenantId && entity.tenantId !== tenantId) {
      throw new ForbiddenException('Cross-tenant operation not allowed');
    }
  }
}
```

### **📧 Tenant-Aware Email Templates**

#### **Template Structure with Tenant Branding**
```html
<!-- group/new-event-announcement.mjml.ejs -->
<%- include('./../layouts/header.mjml.ejs', { tenantConfig }) %>

<mj-section>
  <mj-column>
    <!-- Tenant-specific branding -->
    <% if (tenantConfig.brandingLogo) { %>
    <mj-image src="<%= tenantConfig.brandingLogo %>" alt="<%= tenantConfig.brandingName %>" />
    <% } %>
    
    <mj-text font-size="20px" font-weight="bold" color="#2c3e50">
      New Event: <%= event.name %>
    </mj-text>
    
    <mj-text>
      A new event has been published in <strong><%= group.name %></strong>
    </mj-text>
    
    <mj-text>
      <strong>When:</strong> <%= formatEventDateTime(event.startTime, event.endTime, tenantConfig.timezone) %><br>
      <strong>Where:</strong> <%= event.location || 'TBD' %><br>
      <% if (event.description) { %>
      <strong>Description:</strong><br>
      <%- event.description.replace(/\n/g, '<br>') %>
      <% } %>
    </mj-text>
    
    <!-- Tenant-specific frontend domain -->
    <mj-button href="<%= tenantConfig.frontendDomain %>/events/<%= event.slug %>" 
               background-color="<%= tenantConfig.brandingPrimaryColor || '#3498db' %>">
      View Event & RSVP
    </mj-button>
    
    <mj-text font-size="12px" color="#7f8c8d">
      This email was sent because you're a member of <%= group.name %>. 
      You can adjust your email preferences in your 
      <a href="<%= tenantConfig.frontendDomain %>/profile">profile settings</a>.
    </mj-text>
  </mj-column>
</mj-section>

<%- include('./../layouts/footer.mjml.ejs', { tenantConfig }) %>
```

### **🔐 Tenant Security and Isolation**

#### **Data Access Controls**
```typescript
// Repository patterns ensure tenant isolation
@Injectable()
export class EventRepository {
  async findBySlugAndTenant(slug: string, tenantId: string): Promise<EventEntity> {
    return this.repository.findOne({
      where: { 
        slug: slug,
        tenantId: tenantId  // Always include tenant filter
      }
    });
  }
  
  async getAttendeesByEventAndTenant(
    eventId: number, 
    tenantId: string
  ): Promise<EventAttendeeEntity[]> {
    return this.attendeeRepository.find({
      where: {
        event: { id: eventId, tenantId: tenantId },
        user: { tenantId: tenantId }  // Double-check user tenant
      },
      relations: ['user', 'event']
    });
  }
}
```

#### **Job Queue Tenant Isolation**
```typescript
// Job data always includes tenant context
interface ReminderJobData {
  eventSlug: string;
  tenantId: string;      // Required for all job operations
  reminderType: string;
  timezone: string;
}

// Job processing validates tenant access
@Process('send-reminder')
async processReminderJob(job: Job<ReminderJobData>) {
  // Validate tenant access from job context
  const tenantId = job.data.tenantId;
  
  // All database queries scoped to tenant
  const event = await this.eventRepository.findBySlugAndTenant(
    job.data.eventSlug, 
    tenantId
  );
  
  // All email operations use tenant configuration
  const tenantConfig = await this.tenantService.getConfig(tenantId);
}
```

#### **API Endpoint Tenant Enforcement**
```typescript
// All endpoints enforce tenant context
@Controller('events')
export class EventController {
  @Post(':slug/schedule-reminders')
  async scheduleReminders(
    @Param('slug') slug: string,
    @AuthUser() user: User,          // Contains tenantId
    @TenantContext() tenant: string  // Explicit tenant context
  ) {
    // Validate user belongs to tenant
    if (user.tenantId !== tenant) {
      throw new ForbiddenException('Invalid tenant access');
    }
    
    // All operations scoped to tenant
    const event = await this.eventService.findBySlugAndTenant(slug, tenant);
    await this.reminderScheduler.scheduleEventReminders(event, tenant);
  }
}
```

### **🗄️ Tenant-Aware Database Considerations**

#### **Preference Storage (Tenant-Scoped)**
```sql
-- User preferences are already tenant-isolated via user.tenantId
-- No additional schema changes needed, but queries must always include tenant filter

-- Example: Get users with email preferences enabled for a tenant
SELECT u.id, u.email, u.preferences
FROM users u 
WHERE u.tenant_id = $1 
  AND u.preferences->'emailNotifications'->>'enabled' = 'true';
```

#### **Job Queue Tenant Isolation**
```typescript
// Job IDs include tenant to prevent conflicts
const jobId = `${tenantId}:${eventSlug}:${reminderType}`;

// Job data includes tenant for validation
const jobData = {
  eventSlug,
  tenantId,
  reminderType,
  timezone: tenantConfig.timezone
};
```

### **⚠️ Multi-Tenant Technical Considerations**

#### **Valkey/Redis Tenant Isolation**
```typescript
// Use tenant-prefixed keys for any Redis operations
class TenantAwareElastiCacheService {
  private getTenantKey(tenantId: string, key: string): string {
    return `tenant:${tenantId}:${key}`;
  }
  
  async setTenantData(tenantId: string, key: string, value: any, ttl?: number) {
    return this.set(this.getTenantKey(tenantId, key), value, ttl);
  }
  
  async getTenantData(tenantId: string, key: string) {
    return this.get(this.getTenantKey(tenantId, key));
  }
}
```

#### **Email Volume Management (Per-Tenant)**
```typescript
// Tenant-specific rate limiting
interface TenantEmailLimits {
  dailyAnnouncementLimit: number;   // Max announcements per day
  hourlyReminderLimit: number;      // Max reminders per hour
  maxRecipientsPerEmail: number;    // Max recipients per message
}

@Injectable()
export class TenantEmailRateLimiter {
  async checkTenantEmailLimit(
    tenantId: string, 
    emailType: 'announcement' | 'reminder',
    recipientCount: number
  ): Promise<boolean> {
    const limits = await this.getTenantEmailLimits(tenantId);
    const currentUsage = await this.getTenantEmailUsage(tenantId, emailType);
    
    return currentUsage + recipientCount <= this.getLimit(limits, emailType);
  }
}
```

#### **Timezone Handling (Tenant-Aware)**
```typescript
// All time calculations use tenant timezone
class TenantAwareTimeService {
  calculateReminderDelay(
    eventStartTime: Date, 
    reminderOffset: number, 
    tenantTimezone: string
  ): number {
    // Convert event time to tenant timezone for accurate calculations
    const eventInTenantTime = moment.tz(eventStartTime, tenantTimezone);
    const reminderTime = eventInTenantTime.subtract(reminderOffset, 'minutes');
    
    return reminderTime.valueOf() - Date.now();
  }
}
```

### **🎯 Tenant-Aware Success Metrics**

#### **Per-Tenant Analytics**
- **Adoption Rate**: % of users per tenant who enable email preferences
- **Tenant Usage**: Email volume and engagement by tenant
- **Performance**: Delivery success rates by tenant configuration
- **Feature Utilization**: Most popular notification types per tenant

#### **Cross-Tenant Isolation Validation**
- **Security Audits**: Verify no cross-tenant data leakage in emails
- **Job Processing**: Confirm job queue tenant isolation
- **Database Queries**: Audit all queries include tenant filters
- **Email Delivery**: Validate tenant-specific configuration usage

### **🔄 Tenant Migration and Deployment**

#### **Zero-Downtime Deployment**
- **Feature Flags**: Per-tenant rollout capability
- **Gradual Activation**: Activate for subset of tenants first
- **Monitoring**: Tenant-specific error tracking and performance metrics
- **Rollback**: Ability to disable per tenant without affecting others

#### **Tenant Configuration**
```typescript
// Tenant-specific email notification settings
interface TenantEmailConfig {
  announcementEmailsEnabled: boolean;
  reminderEmailsEnabled: boolean;
  maxAnnouncementRecipients: number;
  defaultReminderTiming: {
    dayBefore: boolean;
    justBefore: number; // minutes before event
  };
  emailRateLimits: {
    announcementsPerDay: number;
    remindersPerHour: number;
  };
}
```

### **🔄 Comprehensive Lifecycle Management & Cleanup**

#### **Email Bounce Tracking & Recovery**
**Bounce Detection Strategy:**
- Track bounce count per user email address (not per tenant)
- After 2 bounces: Mark email as "invalid" and stop all notifications
- User must re-validate email address to resume notifications

**Recovery Process:**
- User can update email in profile settings
- New email triggers standard email validation flow
- Upon validation, reset bounce count and resume notifications
- Users who can't log in contact support for manual recovery

**Data Structure:**
```typescript
interface UserEmailStatus {
  email: string;
  isValid: boolean;
  bounceCount: number;
  lastBounceAt?: Date;
  lastValidatedAt: Date;
}
```

#### **Multi-Level Reminder Scheduling**
**Hierarchy (Override Chain):**
1. **Global Defaults**: System-wide default reminder times
2. **Tenant Config**: Tenant-specific overrides (optional)
3. **User Preferences**: User's default reminder settings
4. **Per-Event Settings**: User customization for specific events

**Reminder Time Structure:**
```typescript
interface ReminderSchedule {
  reminderTimes: Array<{
    amount: number;
    unit: 'months' | 'weeks' | 'days' | 'hours' | 'minutes';
  }>;
}

// Example configurations:
globalDefaults = [
  { amount: 1, unit: 'week' },
  { amount: 1, unit: 'day' },
  { amount: 30, unit: 'minutes' }
];

userCustom = [
  { amount: 3, unit: 'weeks' },
  { amount: 2, unit: 'days' },
  { amount: 5, unit: 'minutes' }
];
```

#### **Cleanup Scenarios & Processing**

**User-Initiated Cleanup (High Priority):**
- User cancels event attendance → Immediate cleanup job
- User leaves group → No cleanup (still gets event notifications if attending)
- User changes email → Reset bounce tracking for new email
- User deletes account → Cancel all notifications

**Event Lifecycle Cleanup (Medium Priority):**
- Event cancelled → Immediate cancellation notifications + cleanup reminders
- Event time changed → Send update notification + reschedule all reminders
- Event deleted → Cancel all notifications + cleanup jobs
- Event moved from group → Notify creator of independence

**System Maintenance Cleanup (Low Priority):**
- Orphaned jobs (events no longer exist) → Hourly cleanup
- Failed job processing → Dead letter queue management
- Bounce tracking cleanup → Daily aggregation

**Group Management Cleanup:**
- Group deleted → Choice: Delete events OR orphan them
- If orphaned: Notify event creators + remove group relationships
- Group privacy changes → No notification changes (users keep access to events they're attending)

#### **Event Update Notification Strategy**

**Update Types & Notification Rules:**
```typescript
interface EventUpdateConfig {
  timeChanges: {
    notifyAttendees: boolean;     // ✅ Always notify
    notifyUnregistered: boolean;  // 🔧 User preference
    rescheduleReminders: boolean; // ✅ Always reschedule
  };
  locationChanges: {
    notifyAttendees: boolean;     // ✅ Always notify
    notifyUnregistered: boolean;  // 🔧 User preference
  };
  cancellations: {
    notifyAttendees: boolean;     // ✅ Always notify
    notifyUnregistered: boolean;  // ✅ Always notify (critical)
  };
}
```

**Preference Structure:**
```typescript
emailNotifications: {
  enabled: boolean;
  eventReminders: {
    enabled: boolean;
    schedule: ReminderSchedule;
    stopWhenUnregistered: boolean; // Default: true
  };
  eventUpdates: {
    timeChanges: boolean;               // Default: true
    locationChanges: boolean;           // Default: true
    cancellations: boolean;             // Default: true (critical)
    continueAfterUnregistered: boolean; // Default: false (user choice)
  };
  newEventNotifications: boolean;       // Default: true
}
```

#### **Channel Fallback Strategy**

**Priority-Based Fallback:**
```typescript
interface NotificationChannels {
  critical: ['email', 'sms', 'platform'];      // Cancellations
  important: ['email', 'platform'];            // Updates  
  routine: ['email', 'platform'];              // Reminders
}
```

**Fallback Logic:**
- Try primary channel (email)
- If email invalid/bounced → Try next channel in priority list
- Platform notifications always work (user logged in)
- SMS requires verified phone number

#### **Cleanup Processing Architecture**

**Event-Driven Cleanup:**
```typescript
// High priority: User actions
@EventListener('attendee.cancelled')
async handleAttendeeCancelled(event) {
  await this.cleanupQueue.add('cancel-user-reminders', {
    userId: event.userId,
    eventId: event.eventId,
    tenantId: event.tenantId
  }, { priority: 100 }); // High priority
}

// Medium priority: Event changes  
@EventListener('event.updated')
async handleEventUpdated(event) {
  await this.cleanupQueue.add('update-event-notifications', {
    eventId: event.eventId,
    changes: event.changes,
    tenantId: event.tenantId
  }, { priority: 50 }); // Medium priority
}

// Low priority: System maintenance
@Cron(CronExpression.EVERY_HOUR)
async cleanupOrphanedJobs() {
  await this.cleanupQueue.add('cleanup-orphaned', {}, { priority: 10 });
}
```

**Non-Blocking User Experience:**
- User actions complete immediately
- Cleanup jobs triggered asynchronously
- Users see instant feedback, cleanup happens in background
- Failed cleanup jobs retry with exponential backoff

#### **Per-Event Reminder Customization**

**Data Model:**
```typescript
interface UserEventPreferences {
  userId: string;
  eventId: string;
  tenantId: string;
  customReminderSchedule?: ReminderSchedule; // Override user default
  emailUpdatesEnabled: boolean;              // Override user default
}
```

**UI Flow:**
- User RSVPs to event
- Option to "Customize reminders for this event"
- Defaults to user's global reminder preferences
- Can override with event-specific settings
- Settings saved per user-event combination

#### **Group Deletion Workflow**

**Admin Choice Process:**
1. Admin initiates group deletion
2. System shows: "X events in this group. Choose action:"
   - **Delete all events** → Cancel events + notify attendees
   - **Orphan events** → Remove group relationship + notify creators
3. If orphaning selected:
   - Remove group references from events
   - Send notification to event creators: "Group dissolved, you now manage this event independently"
   - Existing attendee notifications continue unchanged

#### **Monitoring & Observability**

**Prometheus Metrics Integration:**
```typescript
@Injectable()
export class NotificationMetricsService {
  private readonly emailsSentCounter = new prometheus.Counter({
    name: 'openmeet_emails_sent_total',
    help: 'Total number of emails sent',
    labelNames: ['tenant_id', 'email_type', 'channel', 'status']
  });

  private readonly reminderJobDuration = new prometheus.Histogram({
    name: 'openmeet_reminder_job_duration_seconds',
    help: 'Time taken to process reminder jobs',
    labelNames: ['tenant_id', 'job_type'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  });

  private readonly emailBounceCounter = new prometheus.Counter({
    name: 'openmeet_email_bounces_total',
    help: 'Total number of email bounces',
    labelNames: ['tenant_id', 'bounce_type']
  });

  private readonly activeReminderJobs = new prometheus.Gauge({
    name: 'openmeet_active_reminder_jobs',
    help: 'Number of reminder jobs in queue',
    labelNames: ['tenant_id', 'job_type', 'status']
  });

  trackEmailSent(tenantId: string, emailType: string, channel: string, success: boolean) {
    this.emailsSentCounter.inc({
      tenant_id: tenantId,
      email_type: emailType,
      channel: channel,
      status: success ? 'success' : 'failed'
    });
  }

  trackReminderJobDuration(tenantId: string, jobType: string, durationSeconds: number) {
    this.reminderJobDuration.observe({ tenant_id: tenantId, job_type: jobType }, durationSeconds);
  }
}
```

**OpenTelemetry Tracing Integration:**
```typescript
@Injectable()
export class EventReminderScheduler {
  constructor(
    @Inject('TRACER') private readonly tracer: trace.Tracer,
    private elasticacheService: ElastiCacheService
  ) {}

  async scheduleEventReminders(event: EventEntity, tenantId: string) {
    return this.tracer.startActiveSpan('schedule_event_reminders', async (span) => {
      span.setAttributes({
        'event.slug': event.slug,
        'event.tenant_id': tenantId,
        'event.start_time': event.startTime.toISOString(),
        'operation': 'schedule_reminders'
      });

      try {
        const reminders = this.calculateReminderTimes(event);
        span.setAttributes({
          'reminders.count': reminders.length,
          'reminders.types': reminders.map(r => r.type).join(',')
        });

        for (const reminder of reminders) {
          await this.scheduleIndividualReminder(event, reminder, tenantId, span);
        }

        span.setStatus({ code: trace.SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async scheduleIndividualReminder(
    event: EventEntity, 
    reminder: ReminderConfig, 
    tenantId: string,
    parentSpan: trace.Span
  ) {
    return this.tracer.startActiveSpan('schedule_individual_reminder', { parent: parentSpan }, async (span) => {
      span.setAttributes({
        'reminder.type': reminder.type,
        'reminder.delay_ms': reminder.delay,
        'job.id': `${tenantId}:${event.slug}:${reminder.type}`
      });

      await this.reminderQueue.add('send-reminder', {
        eventSlug: event.slug,
        tenantId: tenantId,
        reminderType: reminder.type,
        timezone: reminder.timezone
      }, { 
        delay: reminder.delay,
        jobId: `${tenantId}:${event.slug}:${reminder.type}`
      });

      span.setStatus({ code: trace.SpanStatusCode.OK });
      span.end();
    });
  }
}
```

**Jaeger Development Environment (Kubernetes):**
**Location**: `/home/tscanlan/projects/openmeet/openmeet-infrastructure/k8s/environments/dev/`

```yaml
# jaeger.yaml - Jaeger deployment for dev environment
apiVersion: v1
kind: Service
metadata:
  name: jaeger
  namespace: openmeet-dev
spec:
  ports:
  - name: jaeger-ui
    port: 16686
    targetPort: 16686
  - name: jaeger-collector
    port: 14268
    targetPort: 14268
  - name: jaeger-otlp-grpc
    port: 4317
    targetPort: 4317
  - name: jaeger-otlp-http
    port: 4318
    targetPort: 4318
  selector:
    app: jaeger
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jaeger
  namespace: openmeet-dev
spec:
  replicas: 1
  selector:
    matchLabels:
      app: jaeger
  template:
    metadata:
      labels:
        app: jaeger
    spec:
      containers:
      - name: jaeger
        image: jaegertracing/all-in-one:1.62
        ports:
        - containerPort: 16686  # Jaeger UI
        - containerPort: 14268  # Jaeger HTTP collector
        - containerPort: 4317   # OTLP gRPC receiver
        - containerPort: 4318   # OTLP HTTP receiver
        env:
        - name: COLLECTOR_OTLP_ENABLED
          value: "true"
        - name: JAEGER_STORAGE_TYPE
          value: memory
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "200m"
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: jaeger-ingress
  namespace: openmeet-dev
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
spec:
  rules:
  - host: jaeger.dev.openmeet.net
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: jaeger
            port:
              number: 16686
```

**API Configuration Update:**
```yaml
# Add to openmeet-api deployment environment variables
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: "http://jaeger.openmeet-dev.svc.cluster.local:4318"
- name: OTEL_SERVICE_NAME
  value: "openmeet-api"
- name: OTEL_TRACES_EXPORTER
  value: "otlp"
```

**Comprehensive Monitoring Dashboards:**

**Email System Health (Prometheus Queries):**
```promql
# Email delivery success rate by tenant
rate(openmeet_emails_sent_total{status="success"}[5m]) / 
rate(openmeet_emails_sent_total[5m]) * 100

# Email bounce rate trending
rate(openmeet_email_bounces_total[1h])

# Reminder job processing time p95
histogram_quantile(0.95, 
  rate(openmeet_reminder_job_duration_seconds_bucket[5m])
)

# Active reminder jobs by tenant
openmeet_active_reminder_jobs

# Failed email deliveries alerting
rate(openmeet_emails_sent_total{status="failed"}[5m]) > 0.1
```

**Distributed Tracing Scenarios:**
```typescript
// Example trace spans for complex notification flows:

// 1. Event Published → Group Announcement Flow
'event.published' → 
  'get_group_members' → 
    'filter_email_preferences' → 
      'send_announcement_emails' → 
        'individual_email_delivery'

// 2. Reminder Job Processing Flow  
'reminder_job_received' →
  'validate_event_exists' →
    'get_eligible_attendees' →
      'filter_bounce_status' →
        'send_reminder_emails' →
          'update_metrics'

// 3. User Cleanup Flow
'user.cancelled_attendance' →
  'find_related_reminder_jobs' →
    'cancel_user_specific_jobs' →
      'update_job_queue_metrics'
```

**Alerting Rules (Prometheus):**
```yaml
# .cursor/prometheus/notification-alerts.yml
groups:
  - name: notification_system
    rules:
      - alert: HighEmailBounceRate
        expr: rate(openmeet_email_bounces_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High email bounce rate detected"
          description: "Bounce rate is {{ $value }} bounces/second"

      - alert: ReminderJobBacklog
        expr: openmeet_active_reminder_jobs{status="waiting"} > 1000
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Reminder job queue backlog"
          description: "{{ $value }} jobs waiting in queue"

      - alert: SlowReminderProcessing
        expr: histogram_quantile(0.95, rate(openmeet_reminder_job_duration_seconds_bucket[5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow reminder job processing"
          description: "95th percentile processing time is {{ $value }}s"
```

**Development Observability Setup:**
```typescript
// Development-specific tracing configuration
export class DevTracingModule {
  static forRoot(): DynamicModule {
    return {
      module: DevTracingModule,
      providers: [
        {
          provide: 'TRACER',
          useFactory: () => {
            const tracer = trace.getTracer('openmeet-notifications', '1.0.0');
            
            // Enhanced development tracing
            NodeSDK.create({
              serviceName: 'openmeet-api',
              instrumentations: [
                new HttpInstrumentation(),
                new NestInstrumentation(),
                // Custom notification system instrumentation
                new NotificationInstrumentation()
              ],
              traceExporter: new JaegerExporter({
                endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces'
              })
            }).start();
            
            return tracer;
          }
        }
      ],
      exports: ['TRACER']
    };
  }
}
```

**Custom Instrumentation for Notification System:**
```typescript
class NotificationInstrumentation extends InstrumentationBase {
  protected init() {
    return [
      // Instrument BullMQ job processing
      new JobProcessingInstrumentation(),
      // Instrument email delivery
      new EmailDeliveryInstrumentation(),
      // Instrument cleanup operations
      new CleanupInstrumentation()
    ];
  }
}
```

**Cleanup Metrics Tracking:**
```typescript
interface CleanupMetrics {
  userRemindersCleanedUp: number;
  orphanedJobsRemoved: number;
  bounceTrackingUpdates: number;
  eventUpdatesProcessed: number;
  failedCleanupOperations: number;
  averageCleanupTime: number;
}
```

**Observability Benefits:**
- **Prometheus**: Real-time metrics, alerting, trend analysis
- **OTEL + Jaeger**: End-to-end trace visualization for complex notification flows
- **Development**: Visual debugging of reminder scheduling and cleanup operations
- **Production**: Performance monitoring, error tracking, capacity planning

### **🚧 Implementation Phases**

**Phase 2.7.1: Core Email Infrastructure** (Week 1)
- Basic reminder scheduling with global defaults
- Simple email bounce tracking
- User email preference UI

**Phase 2.7.2: Lifecycle Management** (Week 2)  
- Event update notifications
- User attendance cleanup
- Group deletion workflows

**Phase 2.7.3: Advanced Preferences** (Week 3)
- Per-event reminder customization
- Multi-level preference inheritance
- Channel fallback implementation

**Phase 2.7.4: Monitoring & Optimization** (Week 4)
- Cleanup job monitoring
- Email health tracking
- Performance optimization

**🎯 Comprehensive Lifecycle-Aware Implementation Ready:** This design covers all major cleanup scenarios, preference hierarchies, and user experience flows while maintaining tenant isolation and system performance.

---

## **📋 Implementation Updates & Recent Changes**

### **✅ Phase 1: Event Announcement System (Completed December 2024 - January 2025)**

#### **🎯 Core Event Notifications Implementation**

**Delivered Features:**
- ✅ **New Event Announcements**: Automatic notifications when events are published
- ✅ **Event Update Notifications**: Alerts when event details change  
- ✅ **Event Cancellation Notifications**: Notifications for cancelled or deleted events
- ✅ **Republish Event Functionality**: UI and backend support for republishing cancelled events

#### **🏗️ Key Architectural Decisions**

**1. Unified Recipient Strategy**

**Problem**: Original design only notified group members, missing event attendees who weren't group members.

**Solution**: Implemented a union-based recipient collection that combines:
```
Event Recipients = Group Members ∪ Event Attendees
```

**Architecture Flow:**
```
Event Created/Updated
       ↓
Collect Group Members (if group exists)
       ↓
Collect Event Attendees
       ↓
Deduplicate by User ID
       ↓
Filter by Email Preferences
       ↓
Send Notifications
```

**Benefits:**
- **Broader Reach**: Attendees receive notifications regardless of group membership
- **Groupless Events Support**: Events without groups can still notify attendees
- **Zero Duplicates**: Users receive only one notification even if they're both group members and attendees

**2. Organizer Communication Strategy**

**Previous Approach**: Excluded organizers from notifications
**New Approach**: Include organizers as notification recipients

**Rationale:**
- **Confirmation Loop**: Organizers need verification their communications are working
- **Accountability**: Organizers see exactly what their community receives
- **Consistency**: Treats organizers as stakeholders, not external actors

**3. Graceful Degradation for Group-Optional Events**

**Challenge**: System originally assumed all events belonged to groups, causing "undefined" errors in notifications.

**Design Solution**: Adaptive content rendering based on group presence:

**Group-Based Event Email Flow:**
```
Subject: "New Event: [Event Name] in [Group Name]"
Content: "An event in [Group Name] has been published!"
Actions: [View Event] [Visit Group]
Footer: "You received this because you're a member of [Group Name]"
```

**Groupless Event Email Flow:**
```
Subject: "New Event: [Event Name]"
Content: "A new event has been published!"
Actions: [View Event]
Footer: "You received this because you've shown interest in this event"
```

#### **📧 Email Template Architecture**

**1. Automated Content Generation**
- **Before**: 400+ lines of manual plain text generation
- **After**: Automated HTML-to-text conversion pipeline
- **Impact**: 90% reduction in template maintenance overhead

**2. Responsive Design System**
- **MJML Framework**: Ensures consistent rendering across email clients
- **Mobile-First**: Optimized for mobile email consumption
- **Accessibility**: Screen reader compatible with proper semantic structure

**3. Dynamic Content Adaptation**
- **Conditional Sections**: Template sections appear/disappear based on data availability
- **Timezone Awareness**: Automatic timezone conversion in email content
- **Multi-Language Ready**: Template structure supports future localization

#### **🖥️ User Interface Enhancements**

**1. Event Lifecycle Management**

**Status Transition Flow:**
```
Draft → Publish → [Notifications Sent]
  ↓         ↓
Edit → Update → [Update Notifications Sent]
  ↓         ↓
Cancel → [Cancellation Notifications Sent]
  ↓
Republish → [Re-announcement Notifications Sent]
```

**2. Republish Event Feature**
- **Access**: Organizer tools dropdown in event page
- **Permission Model**: Inherits same permissions as cancel event functionality
- **User Experience**: Confirmation dialog explaining notification behavior
- **Status Change**: Transitions event from "Cancelled" to "Published" state

**3. Permission-Based UI**
- **Role-Based Access**: Different actions available based on user role
- **Context-Aware**: Actions appear/disappear based on event state
- **Confirmation Patterns**: Consistent dialog patterns for destructive actions

#### **🧪 Quality Assurance Framework**

**Test Strategy:**
- **Comprehensive Coverage**: 22 test scenarios covering all notification paths
- **Edge Case Validation**: Empty recipient lists, missing data, service failures
- **Cross-Scenario Testing**: Group vs groupless events, organizer inclusion patterns
- **Failure Resilience**: SMTP failures handled gracefully without breaking user experience

**Quality Gates:**
- **Strict Type Safety**: Null handling patterns prevent runtime errors
- **Service Boundaries**: Clear separation between notification logic and business logic
- **Code Standards**: Automated linting and formatting for consistency

#### **🚀 Production Deployment Strategy**

**Release Readiness:**
- **Template Validation**: All MJML templates tested across major email clients
- **Service Integration**: Event lifecycle hooks properly configured
- **Tenant Isolation**: Multi-tenant email configuration support
- **Error Observability**: Comprehensive logging for troubleshooting

**Monitoring & Metrics:**
```
Notification Pipeline Health Dashboard:
├── Email Delivery Success Rate
├── Template Rendering Performance  
├── Recipient Collection Efficiency
├── Deduplication Statistics
└── Error Rate by Notification Type
```

#### **🔮 Current Limitations & Future Roadmap**

**Phase 1 Constraints:**
1. **Binary Notification Preferences**: Users receive all notifications or none (no granular control)
2. **Basic Delivery Tracking**: SMTP success/failure only, no open rates or engagement metrics
3. **Single Channel**: Email-only notifications, no SMS or push notification support

**Phase 2 Enhancement Pipeline:**
```
User Preference System:
├── Per-Event-Type Preferences (new/update/cancel)
├── Group-Specific Notification Settings
├── Timezone-Aware Delivery Scheduling
└── Multi-Channel Preference Management

Advanced Analytics:
├── Email Open Rate Tracking
├── Click-Through Analytics
├── Bounce Rate Monitoring
└── Engagement Correlation Analysis

Channel Expansion:
├── SMS Integration via Twilio
├── Push Notifications (PWA)
├── Bluesky Social Integration
└── Webhook Notifications for Third-Party Tools
```

#### **📚 Design Insights & Lessons**

**1. Optional Relationship Design Pattern**
- **Learning**: Always design for optional foreign key relationships
- **Application**: Group associations should gracefully degrade when missing
- **Impact**: Enables flexible event creation patterns without forcing group membership

**2. Stakeholder Communication Strategy**
- **Learning**: Include creators in communication loops for transparency
- **Application**: Organizers receive copies of notifications they trigger
- **Impact**: Builds trust and provides confirmation feedback

**3. Automation-First Template Strategy**
- **Learning**: Manual template maintenance doesn't scale with feature growth
- **Application**: Automated content generation from single source templates
- **Impact**: Consistent user experience with minimal maintenance overhead

#### **📊 Implementation Impact Assessment**

**Quantitative Improvements:**
```
Template Maintenance: 90% reduction (400+ lines → automated)
Test Coverage: 100% of notification scenarios
Error Elimination: Zero "undefined" references in production emails
Feature Completeness: Full event lifecycle coverage (create/update/cancel/republish)
```

**Qualitative Benefits:**
- **User Experience**: Professional, consistent email communications
- **Developer Experience**: Maintainable, testable notification architecture
- **Business Value**: Reliable communication builds platform trust
- **Scalability**: Foundation supports multi-channel expansion

**Strategic Foundation:**
This Phase 1 implementation establishes the architectural patterns, quality standards, and user experience principles that will guide the broader messaging system development outlined in this document. The focus on graceful degradation, comprehensive testing, and automation-first design provides a solid foundation for the advanced features planned in subsequent phases.