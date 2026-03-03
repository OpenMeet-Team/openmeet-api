import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventMailService } from './event-mail.service';
import { MailService } from '../mail/mail.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { UserService } from '../user/user.service';
import { mockUser } from '../test/mocks/user-mocks';
import { mockEvent, mockEventAttendee } from '../test/mocks/event-mocks';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

describe('EventMailService', () => {
  let service: EventMailService;
  let mailService: jest.Mocked<MailService>;
  let eventAttendeeService: jest.Mocked<EventAttendeeService>;
  let userService: jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventMailService,
        {
          provide: MailService,
          useValue: {
            sendMailAttendeeGuestJoined: jest.fn(),
            sendMailAttendeeStatusChanged: jest.fn(),
            sendAdminEventMessage: jest.fn(),
            sendAttendeeContactNotification: jest.fn(),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            getMailServiceEventAttendee: jest.fn(),
            getMailServiceEventAttendeesByPermission: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventMailService>(EventMailService);
    mailService = module.get(MailService);
    eventAttendeeService = module.get(EventAttendeeService);
    userService = module.get(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMailAttendeeGuestJoined', () => {
    it('should send email to all admins with email addresses', async () => {
      const admin1 = {
        ...mockUser,
        id: 10,
        email: 'admin1@example.com',
      } as UserEntity;
      const admin2 = {
        ...mockUser,
        id: 11,
        email: 'admin2@example.com',
      } as UserEntity;

      eventAttendeeService.getMailServiceEventAttendeesByPermission.mockResolvedValue(
        [admin1, admin2],
      );

      await service.sendMailAttendeeGuestJoined(mockEventAttendee);

      expect(mailService.sendMailAttendeeGuestJoined).toHaveBeenCalledTimes(2);
    });

    it('should skip admins who opted out of email notifications', async () => {
      const optedOutAdmin = {
        ...mockUser,
        id: 10,
        email: 'optedout@example.com',
        preferences: { notifications: { email: false } },
      } as UserEntity;
      const optedInAdmin = {
        ...mockUser,
        id: 11,
        email: 'optedin@example.com',
        preferences: { notifications: { email: true } },
      } as UserEntity;

      eventAttendeeService.getMailServiceEventAttendeesByPermission.mockResolvedValue(
        [optedOutAdmin, optedInAdmin],
      );

      await service.sendMailAttendeeGuestJoined(mockEventAttendee);

      expect(mailService.sendMailAttendeeGuestJoined).toHaveBeenCalledTimes(1);
      expect(mailService.sendMailAttendeeGuestJoined).toHaveBeenCalledWith({
        to: 'optedin@example.com',
        data: { eventAttendee: mockEventAttendee },
      });
    });

    it('should send email to admins with no preferences set (default opt-in)', async () => {
      const noPrefsAdmin = {
        ...mockUser,
        id: 10,
        email: 'noprefs@example.com',
        preferences: null,
      } as unknown as UserEntity;

      eventAttendeeService.getMailServiceEventAttendeesByPermission.mockResolvedValue(
        [noPrefsAdmin],
      );

      await service.sendMailAttendeeGuestJoined(mockEventAttendee);

      expect(mailService.sendMailAttendeeGuestJoined).toHaveBeenCalledTimes(1);
    });

    it('should return early when event is undefined', async () => {
      const attendeeWithoutEvent = { ...mockEventAttendee, event: null } as any;

      await service.sendMailAttendeeGuestJoined(attendeeWithoutEvent);

      expect(
        eventAttendeeService.getMailServiceEventAttendeesByPermission,
      ).not.toHaveBeenCalled();
    });
  });

  describe('sendMailAttendeeStatusChanged', () => {
    it('should send email when user has email and has not opted out', async () => {
      const attendee = {
        ...mockEventAttendee,
        user: {
          ...mockUser,
          email: 'user@example.com',
          preferences: { notifications: { email: true } },
        },
      };
      eventAttendeeService.getMailServiceEventAttendee.mockResolvedValue(
        attendee as any,
      );

      await service.sendMailAttendeeStatusChanged(1);

      expect(mailService.sendMailAttendeeStatusChanged).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should skip sending email when user opted out of email notifications', async () => {
      const attendee = {
        ...mockEventAttendee,
        user: {
          ...mockUser,
          email: 'optedout@example.com',
          preferences: { notifications: { email: false } },
        },
      };
      eventAttendeeService.getMailServiceEventAttendee.mockResolvedValue(
        attendee as any,
      );

      await service.sendMailAttendeeStatusChanged(1);

      expect(mailService.sendMailAttendeeStatusChanged).not.toHaveBeenCalled();
    });

    it('should send email when user has no preferences set (default opt-in)', async () => {
      const attendee = {
        ...mockEventAttendee,
        user: {
          ...mockUser,
          email: 'user@example.com',
          preferences: null,
        },
      };
      eventAttendeeService.getMailServiceEventAttendee.mockResolvedValue(
        attendee as any,
      );

      await service.sendMailAttendeeStatusChanged(1);

      expect(mailService.sendMailAttendeeStatusChanged).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('sendAdminMessageToAttendees', () => {
    it('should skip attendees who opted out of email notifications', async () => {
      const optedOutAttendee = {
        id: 2,
        email: 'optedout@example.com',
        preferences: { notifications: { email: false } },
      } as any;
      const optedInAttendee = {
        id: 3,
        email: 'optedin@example.com',
        preferences: { notifications: { email: true } },
      } as any;

      userService.findById.mockResolvedValue(mockUser);
      eventAttendeeService.getMailServiceEventAttendeesByPermission.mockResolvedValue(
        [optedOutAttendee, optedInAttendee],
      );
      mailService.sendAdminEventMessage.mockResolvedValue(undefined);

      const result = await service.sendAdminMessageToAttendees(
        mockEvent,
        1,
        'Test Subject',
        'Test Message',
      );

      // Admin copy + 1 opted-in attendee = 2 emails (opted-out attendee skipped)
      expect(mailService.sendAdminEventMessage).toHaveBeenCalledTimes(2);
      expect(result.deliveredCount).toBe(2);
    });

    it('should throw NotFoundException when no attendees found', async () => {
      userService.findById.mockResolvedValue(mockUser);
      eventAttendeeService.getMailServiceEventAttendeesByPermission.mockResolvedValue(
        [],
      );

      await expect(
        service.sendAdminMessageToAttendees(mockEvent, 1, 'Subject', 'Message'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendAttendeeContactToOrganizers', () => {
    it('should skip organizers who opted out of email notifications', async () => {
      const optedOutOrganizer = {
        ...mockUser,
        id: 10,
        email: 'optedout-organizer@example.com',
        preferences: { notifications: { email: false } },
      } as UserEntity;
      const optedInOrganizer = {
        ...mockUser,
        id: 11,
        email: 'optedin-organizer@example.com',
        preferences: { notifications: { email: true } },
      } as UserEntity;
      const attendee = {
        ...mockUser,
        id: 5,
        email: 'attendee@example.com',
      } as UserEntity;

      const eventWithUser = { ...mockEvent, user: { id: 99 } };

      userService.findById.mockImplementation(async (id) => {
        if (id === 5) return attendee;
        if (id === 99) return optedOutOrganizer; // event owner also opted out
        return null;
      });
      eventAttendeeService.getMailServiceEventAttendeesByPermission.mockResolvedValue(
        [optedOutOrganizer, optedInOrganizer],
      );
      (
        mailService.sendAttendeeContactNotification as jest.Mock
      ).mockResolvedValue(undefined);

      const result = await service.sendAttendeeContactToOrganizers(
        eventWithUser,
        5,
        'question',
        'Test Subject',
        'Test Message',
      );

      // Only opted-in organizer should receive the email
      expect(
        mailService.sendAttendeeContactNotification as jest.Mock,
      ).toHaveBeenCalledTimes(1);
      expect(
        mailService.sendAttendeeContactNotification as jest.Mock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'optedin-organizer@example.com' }),
      );
      expect(result.deliveredCount).toBe(1);
    });
  });
});
