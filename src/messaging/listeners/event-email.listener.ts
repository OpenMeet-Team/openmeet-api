import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UnifiedMessagingService } from '../services/unified-messaging.service';
import { MessageType, MessageChannel } from '../interfaces/message.interface';

export interface EventAttendeeJoinedEvent {
  attendeeId: number;
  eventSlug?: string;
  tenantId: string;
}

export interface EventAttendeeStatusChangedEvent {
  attendeeId: number;
  eventSlug?: string;
  tenantId: string;
  newStatus?: string;
}

@Injectable()
export class EventEmailListener {
  constructor(private readonly messagingService: UnifiedMessagingService) {}

  @OnEvent('event.attendee.joined')
  async handleEventAttendeeJoined(event: EventAttendeeJoinedEvent): Promise<void> {
    try {
      // Send system message notification to event organizers about new attendee
      await this.messagingService.sendSystemMessage({
        type: MessageType.EVENT_ANNOUNCEMENT,
        subject: 'New attendee joined your event',
        content: 'A new attendee has joined your event. You can view the attendee details in the event management section.',
        channels: [MessageChannel.EMAIL],
        templateId: 'event/attendee-guest-joined',
        metadata: {
          eventType: 'event.attendee.joined',
          attendeeId: event.attendeeId,
          eventSlug: event.eventSlug,
          tenantId: event.tenantId,
        },
        targetUser: {
          type: 'event_organizers',
          attendeeId: event.attendeeId,
        },
      });
    } catch (error) {
      console.error('Error handling event attendee joined event:', error);
    }
  }

  @OnEvent('event.attendee.status.changed')
  async handleEventAttendeeStatusChanged(event: EventAttendeeStatusChangedEvent): Promise<void> {
    try {
      // Send system message notification to attendee about status change
      await this.messagingService.sendSystemMessage({
        type: MessageType.EVENT_ANNOUNCEMENT,
        subject: 'Your event attendance status has been updated',
        content: `Your attendance status for the event has been updated${event.newStatus ? ` to ${event.newStatus}` : ''}. Please check the event details for more information.`,
        channels: [MessageChannel.EMAIL],
        templateId: 'event/attendee-status-changed',
        metadata: {
          eventType: 'event.attendee.status.changed',
          attendeeId: event.attendeeId,
          eventSlug: event.eventSlug,
          newStatus: event.newStatus,
          tenantId: event.tenantId,
        },
        targetUser: {
          type: 'event_attendee',
          attendeeId: event.attendeeId,
        },
      });
    } catch (error) {
      console.error('Error handling event attendee status changed event:', error);
    }
  }
}