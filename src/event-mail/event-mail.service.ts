import { Injectable } from '@nestjs/common';
import { EventAttendeePermission } from '../core/constants/constant';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class EventMailService {
  constructor(
    private readonly mailService: MailService,
    private readonly eventAttendeeService: EventAttendeeService,
  ) {}

  async sendMailAttendeeGuestJoined(eventAttendee: EventAttendeesEntity) {
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
    const eventAttendee =
      await this.eventAttendeeService.getMailServiceEventAttendee(
        eventAttendeeId,
      );

    if (eventAttendee.user.email) {
      await this.mailService.sendMailAttendeeStatusChanged({
        to: eventAttendee.user.email,
        data: { eventAttendee },
      });
    }
  }
}
