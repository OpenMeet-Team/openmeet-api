import { Injectable } from '@nestjs/common';
import { EventAttendeePermission } from 'src/core/constants/constant';
import { EventAttendeeService } from 'src/event-attendee/event-attendee.service';
import { EventAttendeesEntity } from 'src/event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { MailService } from 'src/mail/mail.service';

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
    const admins =
      await this.eventAttendeeService.getMailServiceEventAttendeesByPermission(
        eventAttendeeId,
        EventAttendeePermission.ManageAttendees,
      );

    const eventAttendee =
      await this.eventAttendeeService.getMailServiceEventAttendee(
        eventAttendeeId,
      );

    for (const admin of admins) {
      if (admin.email) {
        await this.mailService.sendMailAttendeeStatusChanged({
          to: admin.email,
          data: { eventAttendee },
        });
      }
    }
  }
}
