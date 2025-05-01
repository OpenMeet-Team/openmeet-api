import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { EventAttendeePermission } from '../core/constants/constant';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class EventMailService {
  constructor(
    private readonly mailService: MailService,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
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
}
