import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { EventAttendeePermission } from '../core/constants/constant';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { MailService } from '../mail/mail.service';
import { UserService } from '../user/user.service';
import { AdminMessageResult } from '../event/interfaces/admin-message-result.interface';

@Injectable()
export class EventMailService {
  constructor(
    private readonly mailService: MailService,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  async sendMailAttendeeGuestJoined(eventAttendee: EventAttendeesEntity) {
    // Check if event is defined before accessing its id
    if (!eventAttendee || !eventAttendee.event) {
      console.warn(
        `[sendMailAttendeeGuestJoined] Event is undefined for attendee with ID ${eventAttendee?.id}`,
      );
      return; // Skip sending email if event is undefined
    }

    const admins =
      await this.eventAttendeeService.getMailServiceEventAttendeesByPermission(
        eventAttendee.event.id,
        EventAttendeePermission.ManageAttendees,
      );

    for (const admin of admins) {
      if (admin.email) {
        await this.mailService.sendMailAttendeeGuestJoined({
          to: admin.email,
          data: { eventAttendee },
        });
      }
    }
  }

  async sendMailAttendeeStatusChanged(eventAttendeeId: number) {
    try {
      const eventAttendee =
        await this.eventAttendeeService.getMailServiceEventAttendee(
          eventAttendeeId,
        );

      // Check for missing user or email before attempting to send
      if (!eventAttendee.user) {
        console.warn(
          `[sendMailAttendeeStatusChanged] User is undefined for attendee with ID ${eventAttendeeId}`,
        );
        return;
      }

      if (eventAttendee.user.email) {
        await this.mailService.sendMailAttendeeStatusChanged({
          to: eventAttendee.user.email,
          data: { eventAttendee },
        });
      }
    } catch (error) {
      console.error(
        `[sendMailAttendeeStatusChanged] Error processing mail for attendee ID ${eventAttendeeId}:`,
        error,
      );
      // Continue execution - don't let mail errors affect the overall operation
    }
  }

  async sendAdminMessageToAttendees(
    event: any, // Event entity passed from calling code
    adminUserId: number,
    subject: string,
    message: string,
  ): Promise<AdminMessageResult> {
    // Get admin and attendees info
    const admin = await this.userService.findById(adminUserId);

    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    // Get all event attendees with MESSAGE_ATTENDEES permission
    const attendees =
      await this.eventAttendeeService.getMailServiceEventAttendeesByPermission(
        event.id,
        EventAttendeePermission.ViewEvent, // Get all attendees who can view the event
      );

    if (attendees.length === 0) {
      throw new NotFoundException('No attendees found for this event');
    }

    let deliveredCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Create a set to track unique email addresses to avoid duplicates
    const emailsSent = new Set<string>();

    // Always include the admin who sent the message
    if (admin.email) {
      try {
        await this.mailService.sendAdminEventMessage({
          to: admin.email,
          data: {
            event,
            admin,
            subject,
            message,
          },
        });
        deliveredCount++;
        emailsSent.add(admin.email);
      } catch (error) {
        failedCount++;
        errors.push(`Failed to send to admin ${admin.email}: ${error.message}`);
      }
    }

    // Send individual emails to attendees with email addresses
    for (const attendee of attendees) {
      if (attendee.email && !emailsSent.has(attendee.email)) {
        try {
          await this.mailService.sendAdminEventMessage({
            to: attendee.email,
            data: {
              event,
              admin,
              subject,
              message,
            },
          });
          deliveredCount++;
          emailsSent.add(attendee.email);
        } catch (error) {
          failedCount++;
          errors.push(`Failed to send to ${attendee.email}: ${error.message}`);
        }
      }
    }

    return {
      success: failedCount === 0,
      messageId: `event_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deliveredCount,
      failedCount,
      errors: failedCount > 0 ? errors : undefined,
    };
  }

  async previewAdminMessage(
    event: any,
    adminUserId: number,
    subject: string,
    message: string,
    testEmail: string,
  ): Promise<void> {
    const admin = await this.userService.findById(adminUserId);

    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    await this.mailService.sendAdminEventMessage({
      to: testEmail,
      data: {
        event,
        admin,
        subject: `[PREVIEW] ${subject}`,
        message,
      },
    });
  }

  async sendAttendeeContactToOrganizers(
    event: any, // Event entity passed from calling code
    attendeeUserId: number,
    contactType: string,
    subject: string,
    message: string,
  ): Promise<AdminMessageResult> {
    // Get attendee info
    const attendee = await this.userService.findById(attendeeUserId);

    if (!attendee) {
      throw new NotFoundException('Attendee user not found');
    }

    // Get all event organizers (users with ManageEvent permission)
    const organizers =
      await this.eventAttendeeService.getMailServiceEventAttendeesByPermission(
        event.id,
        EventAttendeePermission.ManageEvent, // Target event organizers
      );

    if (organizers.length === 0) {
      throw new NotFoundException('No organizers found for this event');
    }

    let deliveredCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Send notification to all organizers
    for (const organizer of organizers) {
      if (organizer.email) {
        try {
          await this.mailService.sendAttendeeContactNotification({
            to: organizer.email,
            data: {
              event,
              attendee,
              contactType,
              subject,
              message,
            },
          });
          deliveredCount++;
        } catch (error) {
          failedCount++;
          errors.push(
            `Failed to send to organizer ${organizer.email}: ${error.message}`,
          );
        }
      }
    }

    return {
      success: failedCount === 0,
      messageId: `attendee_contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deliveredCount,
      failedCount,
      errors: failedCount > 0 ? errors : undefined,
    };
  }
}
