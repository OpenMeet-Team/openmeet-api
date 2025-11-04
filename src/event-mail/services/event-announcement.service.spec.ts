import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventAnnouncementService } from './event-announcement.service';
import { MailerService } from '../../mailer/mailer.service';
import { UserService } from '../../user/user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { ICalendarService } from '../../event/services/ical/ical.service';

describe('EventAnnouncementService', () => {
  let service: EventAnnouncementService;
  let mailerService: jest.Mocked<MailerService>;
  let eventQueryService: jest.Mocked<any>;
  let groupMemberService: jest.Mocked<any>;
  let eventAttendeeService: jest.Mocked<any>;

  const mockRequest = {
    tenantId: 'test-tenant-123',
    user: { id: 1, slug: 'test-user' },
  };

  const mockEvent = {
    id: 1,
    slug: 'test-event',
    name: 'Test Event',
    description: 'A test event',
    startDate: new Date('2025-07-01T10:00:00Z'),
    endDate: new Date('2025-07-01T12:00:00Z'),
    timeZone: 'America/New_York',
    location: 'Test Location',
    status: 'published', // Default to published
    group: {
      id: 1,
      slug: 'test-group',
      name: 'Test Group',
    },
    user: {
      id: 1,
      slug: 'organizer-user',
      firstName: 'John',
      lastName: 'Doe',
      email: 'organizer@example.com',
    },
  };

  const mockGroupMembers = [
    {
      id: 1,
      user: {
        id: 2,
        slug: 'member-1',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
      },
    },
    {
      id: 2,
      user: {
        id: 3,
        slug: 'member-2',
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob@example.com',
      },
    },
    {
      id: 3,
      user: {
        id: 4,
        slug: 'member-3',
        firstName: 'Carol',
        lastName: 'Wilson',
        email: 'carol@example.com',
      },
    },
  ];

  const mockEventAttendees = [
    {
      id: 1,
      user: {
        id: 5,
        slug: 'attendee-1',
        firstName: 'David',
        lastName: 'Brown',
        email: 'david@example.com',
      },
    },
    {
      id: 2,
      user: {
        id: 6,
        slug: 'attendee-2',
        firstName: 'Emma',
        lastName: 'Davis',
        email: 'emma@example.com',
      },
    },
  ];

  beforeEach(async () => {
    const mockMailerService = {
      sendMail: jest.fn(),
      sendMjmlMail: jest.fn(),
      sendCalendarInviteMail: jest.fn(),
    };

    const mockICalendarService = {
      generateCalendarInvite: jest
        .fn()
        .mockReturnValue('BEGIN:VCALENDAR\nEND:VCALENDAR'),
      generateCancellationInvite: jest
        .fn()
        .mockReturnValue('BEGIN:VCALENDAR\nMETHOD:CANCEL\nEND:VCALENDAR'),
    };

    const mockUserService = {
      findOne: jest.fn(),
      findMany: jest.fn(),
    };

    const mockEventQueryService = {
      findEventBySlug: jest.fn().mockImplementation((slug) => {
        if (slug === 'test-event') {
          return Promise.resolve(mockEvent);
        }
        return Promise.resolve(null);
      }),
    };

    const mockGroupMemberService = {
      findGroupDetailsMembers: jest.fn().mockResolvedValue(mockGroupMembers),
    };

    const mockEventAttendeeService = {
      findEventAttendees: jest.fn().mockResolvedValue(mockEventAttendees),
    };

    const mockTenantConnectionService = {
      getTenantConfig: jest.fn().mockReturnValue({
        name: 'Test Tenant',
        frontendDomain: 'https://test.openmeet.net',
        mailDefaultName: 'Test OpenMeet',
        mailDefaultEmail: 'noreply@test.openmeet.net',
      }),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockConfigService = {
      getOrThrow: jest
        .fn()
        .mockReturnValue('https://platform-dev.openmeet.net'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventAnnouncementService,
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        {
          provide: ICalendarService,
          useValue: mockICalendarService,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    service = module.get<EventAnnouncementService>(EventAnnouncementService);
    mailerService = module.get(MailerService);
    eventQueryService = module.get(EventQueryService);
    groupMemberService = module.get(GroupMemberService);
    eventAttendeeService = module.get(EventAttendeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleEventCreated', () => {
    beforeEach(() => {
      mailerService.sendCalendarInviteMail.mockResolvedValue(undefined);
    });

    it('should send announcement emails to group members and event attendees when a new event is created', async () => {
      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - emails should be sent to group members + event attendees

      // Should send emails to group members (Alice, Bob, Carol) + event attendees (David, Emma) = 5 total, excluding organizer
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(5);

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'alice@example.com',
        subject: 'New Event: Test Event in Test Group',
        templateName: 'event/new-event-announcement',
        context: {
          recipientName: 'Alice',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'bob@example.com',
        subject: 'New Event: Test Event in Test Group',
        templateName: 'event/new-event-announcement',
        context: {
          recipientName: 'Bob',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'carol@example.com',
        subject: 'New Event: Test Event in Test Group',
        templateName: 'event/new-event-announcement',
        context: {
          recipientName: 'Carol',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });
    });

    it('should send emails to event attendees even if the event has no group', async () => {
      // Arrange - Mock service to return event without group but with attendees
      const eventWithoutGroup = { ...mockEvent, group: null };
      eventQueryService.findEventBySlug.mockResolvedValueOnce(
        eventWithoutGroup,
      );

      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - Should send emails to event attendees (David, Emma) even without a group
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(2);
    });

    it('should send emails to event attendees even if group has no members', async () => {
      // Arrange - Mock empty group members but event attendees exist
      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce([]);

      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - Should send emails to event attendees (David, Emma) even if group has no members
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(2);
    });

    it('should not send emails if there are no group members and no event attendees', async () => {
      // Arrange - Mock empty group members and empty event attendees
      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce([]);
      eventAttendeeService.findEventAttendees.mockResolvedValueOnce([]);

      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendCalendarInviteMail).not.toHaveBeenCalled();
    });

    it('should send email to the event organizer if they are also a group member', async () => {
      // Arrange - add organizer as a group member
      const groupMembersIncludingOrganizer = [
        ...mockGroupMembers,
        {
          id: 4,
          user: mockEvent.user, // Organizer is also a member
        },
      ];

      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce(
        groupMembersIncludingOrganizer,
      );

      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      // Should send 6 emails (Alice, Bob, Carol, David, Emma, John the organizer)
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(6);

      // Verify organizer received an email
      const emailCalls = mailerService.sendCalendarInviteMail.mock.calls;
      const emailAddresses = emailCalls.map((call) => call[0].to);
      expect(emailAddresses).toContain('organizer@example.com');
    });

    it('should handle email sending failures gracefully', async () => {
      // Arrange
      mailerService.sendCalendarInviteMail.mockRejectedValueOnce(
        new Error('SMTP server down'),
      );

      // Act & Assert - should not throw
      await expect(
        service.handleEventCreated({
          eventId: 1,
          slug: 'test-event',
          userId: 1,
          tenantId: 'test-tenant-123',
        }),
      ).resolves.not.toThrow();

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(5);
    });

    it('should not send emails if event is not found', async () => {
      // Arrange - Mock service to return null for non-existent event
      eventQueryService.findEventBySlug.mockResolvedValueOnce(null);

      // Act
      await service.handleEventCreated({
        eventId: 999,
        slug: 'non-existent-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendCalendarInviteMail).not.toHaveBeenCalled();
    });
  });

  describe('handleEventUpdated', () => {
    beforeEach(() => {
      mailerService.sendCalendarInviteMail.mockResolvedValue(undefined);
      mailerService.sendMjmlMail.mockResolvedValue(undefined);
    });

    it('should send update announcement emails to group members when an event is updated', async () => {
      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - emails should be sent to group members
      // Should send emails to all members except the organizer (Alice, Bob, and Carol)
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(5);

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'alice@example.com',
        subject: 'Updated Event: Test Event in Test Group',
        templateName: 'event/event-update-announcement',
        context: {
          recipientName: 'Alice',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'bob@example.com',
        subject: 'Updated Event: Test Event in Test Group',
        templateName: 'event/event-update-announcement',
        context: {
          recipientName: 'Bob',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'carol@example.com',
        subject: 'Updated Event: Test Event in Test Group',
        templateName: 'event/event-update-announcement',
        context: {
          recipientName: 'Carol',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });
    });

    it('should send emails to event attendees even if the updated event has no group', async () => {
      // Arrange - Mock service to return event without group but with attendees
      const eventWithoutGroup = { ...mockEvent, group: null };
      eventQueryService.findEventBySlug.mockResolvedValueOnce(
        eventWithoutGroup,
      );

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - Should send emails to event attendees (David, Emma) even without a group
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(2);
    });

    it('should send emails to event attendees even if updated event group has no members', async () => {
      // Arrange - Mock empty group members but event attendees exist
      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce([]);

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - Should send emails to event attendees (David, Emma) even if group has no members
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(2);
    });

    it('should not send emails if updated event has no group members and no event attendees', async () => {
      // Arrange - Mock empty group members and empty event attendees
      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce([]);
      eventAttendeeService.findEventAttendees.mockResolvedValueOnce([]);

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendCalendarInviteMail).not.toHaveBeenCalled();
    });

    it('should send update email to the event organizer if they are also a group member', async () => {
      // Arrange - add organizer as a group member
      const groupMembersIncludingOrganizer = [
        ...mockGroupMembers,
        {
          id: 4,
          user: mockEvent.user, // Organizer is also a member
        },
      ];

      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce(
        groupMembersIncludingOrganizer,
      );

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      // Should send 6 emails (Alice, Bob, Carol, David, Emma, John the organizer)
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(6);

      // Verify organizer received an email
      const emailCalls = mailerService.sendCalendarInviteMail.mock.calls;
      const emailAddresses = emailCalls.map((call) => call[0].to);
      expect(emailAddresses).toContain('organizer@example.com');
    });

    it('should handle email sending failures gracefully for updates', async () => {
      // Arrange
      mailerService.sendCalendarInviteMail.mockRejectedValueOnce(
        new Error('SMTP server down'),
      );

      // Act & Assert - should not throw
      await expect(
        service.handleEventUpdated({
          eventId: 1,
          slug: 'test-event',
          userId: 1,
          tenantId: 'test-tenant-123',
        }),
      ).resolves.not.toThrow();

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(5);
    });

    it('should not send emails if updated event is not found', async () => {
      // Arrange - Mock service to return null for non-existent event
      eventQueryService.findEventBySlug.mockResolvedValueOnce(null);

      // Act
      await service.handleEventUpdated({
        eventId: 999,
        slug: 'non-existent-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendCalendarInviteMail).not.toHaveBeenCalled();
    });

    it('should send cancellation emails when event status is cancelled', async () => {
      // Arrange - Mock event with cancelled status
      const cancelledEvent = { ...mockEvent, status: 'cancelled' };
      eventQueryService.findEventBySlug.mockResolvedValueOnce(cancelledEvent);
      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce(
        mockGroupMembers,
      );

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - should send cancellation emails, not update emails
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(5);

      // Verify the emails use cancellation template and subject
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'alice@example.com',
        subject: 'Cancelled Event: Test Event in Test Group',
        templateName: 'event/event-cancellation-announcement',
        context: {
          recipientName: 'Alice',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });
    });
  });

  describe('handleEventDeleted', () => {
    beforeEach(() => {
      mailerService.sendCalendarInviteMail.mockResolvedValue(undefined);
    });

    it('should send deletion announcement emails to group members when an event is deleted', async () => {
      // Act
      await service.handleEventDeleted(mockEvent);

      // Assert - emails should be sent to group members
      // Should send emails to all members except the organizer (Alice, Bob, and Carol)
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(5);

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'alice@example.com',
        subject: 'Cancelled Event: Test Event in Test Group',
        templateName: 'event/event-cancellation-announcement',
        context: {
          recipientName: 'Alice',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'bob@example.com',
        subject: 'Cancelled Event: Test Event in Test Group',
        templateName: 'event/event-cancellation-announcement',
        context: {
          recipientName: 'Bob',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith({
        to: 'carol@example.com',
        subject: 'Cancelled Event: Test Event in Test Group',
        templateName: 'event/event-cancellation-announcement',
        context: {
          recipientName: 'Carol',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventEndDateTime: new Date('2025-07-01T12:00:00Z'),
          eventTimeZone: 'America/New_York',
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          organizerSlug: 'organizer-user',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
          organizerUrl: expect.stringContaining('/members/organizer-user'),
        },
        tenantConfig: expect.any(Object),
        icsContent: expect.any(String),
      });
    });

    it('should send emails to event attendees even if the deleted event has no group', async () => {
      // Arrange - Event without group
      const eventWithoutGroup = { ...mockEvent, group: null };

      // Act
      await service.handleEventDeleted(eventWithoutGroup);

      // Assert - Should send emails to event attendees (David, Emma) even without a group
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(2);
    });

    it('should send emails to event attendees even if deleted event group has no members', async () => {
      // Arrange - Mock empty group members but event attendees exist
      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce([]);

      // Act
      await service.handleEventDeleted(mockEvent);

      // Assert - Should send emails to event attendees (David, Emma) even if group has no members
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(2);
    });

    it('should not send emails if deleted event has no group members and no event attendees', async () => {
      // Arrange - Mock empty group members and empty event attendees
      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce([]);
      eventAttendeeService.findEventAttendees.mockResolvedValueOnce([]);

      // Act
      await service.handleEventDeleted(mockEvent);

      // Assert
      expect(mailerService.sendCalendarInviteMail).not.toHaveBeenCalled();
    });

    it('should send cancellation email to the event organizer if they are also a group member', async () => {
      // Arrange - add organizer as a group member
      const groupMembersIncludingOrganizer = [
        ...mockGroupMembers,
        {
          id: 4,
          user: mockEvent.user, // Organizer is also a member
        },
      ];

      groupMemberService.findGroupDetailsMembers.mockResolvedValueOnce(
        groupMembersIncludingOrganizer,
      );

      // Act
      await service.handleEventDeleted(mockEvent);

      // Assert
      // Should send 6 emails (Alice, Bob, Carol, David, Emma, John the organizer)
      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(6);

      // Verify organizer received an email
      const emailCalls = mailerService.sendCalendarInviteMail.mock.calls;
      const emailAddresses = emailCalls.map((call) => call[0].to);
      expect(emailAddresses).toContain('organizer@example.com');
    });

    it('should handle email sending failures gracefully for cancellations', async () => {
      // Arrange
      mailerService.sendCalendarInviteMail.mockRejectedValueOnce(
        new Error('SMTP server down'),
      );

      // Act & Assert - should not throw
      await expect(
        service.handleEventDeleted(mockEvent),
      ).resolves.not.toThrow();

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledTimes(5);
    });
  });
});
