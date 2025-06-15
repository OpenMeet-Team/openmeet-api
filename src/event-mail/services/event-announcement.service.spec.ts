import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventAnnouncementService } from './event-announcement.service';
import { MailerService } from '../../mailer/mailer.service';
import { UserService } from '../../user/user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';

describe('EventAnnouncementService', () => {
  let service: EventAnnouncementService;
  let mailerService: jest.Mocked<MailerService>;
  let tenantConnectionService: jest.Mocked<TenantConnectionService>;

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

  beforeEach(async () => {
    const mockMailerService = {
      sendMail: jest.fn(),
      sendMjmlMail: jest.fn(),
    };

    const mockUserService = {
      findOne: jest.fn(),
      findMany: jest.fn(),
    };

    const mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'EventEntity') {
            return {
              findOne: jest.fn().mockImplementation((options) => {
                if (options.where.slug === 'test-event') {
                  return Promise.resolve(mockEvent);
                }
                return Promise.resolve(null);
              }),
            };
          } else if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue(mockGroupMembers),
            };
          }
          return {};
        }),
      }),
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
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    service = module.get<EventAnnouncementService>(EventAnnouncementService);
    mailerService = module.get(MailerService);
    tenantConnectionService = module.get(TenantConnectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleEventCreated', () => {
    beforeEach(() => {
      mailerService.sendMjmlMail.mockResolvedValue(undefined);
    });

    it('should send announcement emails to group members when a new event is created', async () => {
      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - emails should be sent to group members

      // Should send emails to all members except the organizer (Alice, Bob, and Carol)
      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'alice@example.com',
        subject: 'New Event: Test Event in Test Group',
        templateName: 'event/new-event-announcement',
        context: {
          recipientName: 'Alice',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'bob@example.com',
        subject: 'New Event: Test Event in Test Group',
        templateName: 'event/new-event-announcement',
        context: {
          recipientName: 'Bob',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'carol@example.com',
        subject: 'New Event: Test Event in Test Group',
        templateName: 'event/new-event-announcement',
        context: {
          recipientName: 'Carol',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });
    });

    it('should not send emails if the event has no group', async () => {
      // Arrange - Mock repository to return event without group
      const eventWithoutGroup = { ...mockEvent, group: null };
      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(eventWithoutGroup),
        }),
      });

      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendMjmlMail).not.toHaveBeenCalled();
    });

    it('should not send emails if group has no members', async () => {
      // Arrange - Mock empty group members
      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'EventEntity') {
            return {
              findOne: jest.fn().mockResolvedValue(mockEvent),
            };
          } else if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue([]), // Empty group
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendMjmlMail).not.toHaveBeenCalled();
    });

    it('should not send email to the event organizer if they are also a group member', async () => {
      // Arrange - add organizer as a group member
      const groupMembersIncludingOrganizer = [
        ...mockGroupMembers,
        {
          id: 4,
          user: mockEvent.user, // Organizer is also a member
        },
      ];

      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'EventEntity') {
            return {
              findOne: jest.fn().mockResolvedValue(mockEvent),
            };
          } else if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue(groupMembersIncludingOrganizer),
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventCreated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      // Should still only send 3 emails (Alice, Bob, and Carol), not to the organizer
      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);

      // Verify organizer didn't receive an email
      const emailCalls = mailerService.sendMjmlMail.mock.calls;
      const emailAddresses = emailCalls.map((call) => call[0].to);
      expect(emailAddresses).not.toContain('organizer@example.com');
    });

    it('should handle email sending failures gracefully', async () => {
      // Arrange
      mailerService.sendMjmlMail.mockRejectedValueOnce(
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

      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);
    });

    it('should not send emails if event is not found', async () => {
      // Arrange - Mock repository to return null for non-existent event
      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue(null),
        }),
      });

      // Act
      await service.handleEventCreated({
        eventId: 999,
        slug: 'non-existent-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendMjmlMail).not.toHaveBeenCalled();
    });
  });

  describe('handleEventUpdated', () => {
    beforeEach(() => {
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
      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'alice@example.com',
        subject: 'Updated Event: Test Event in Test Group',
        templateName: 'event/event-update-announcement',
        context: {
          recipientName: 'Alice',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'bob@example.com',
        subject: 'Updated Event: Test Event in Test Group',
        templateName: 'event/event-update-announcement',
        context: {
          recipientName: 'Bob',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'carol@example.com',
        subject: 'Updated Event: Test Event in Test Group',
        templateName: 'event/event-update-announcement',
        context: {
          recipientName: 'Carol',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });
    });

    it('should not send emails if the updated event has no group', async () => {
      // Arrange - Mock repository to return event without group
      const eventWithoutGroup = { ...mockEvent, group: null };
      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'EventEntity') {
            return {
              findOne: jest.fn().mockResolvedValue(eventWithoutGroup),
            };
          } else if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue([]), // Empty group
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendMjmlMail).not.toHaveBeenCalled();
    });

    it('should not send emails if updated event group has no members', async () => {
      // Arrange - Mock empty group members
      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'EventEntity') {
            return {
              findOne: jest.fn().mockResolvedValue(mockEvent),
            };
          } else if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue([]), // Empty group
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendMjmlMail).not.toHaveBeenCalled();
    });

    it('should not send update email to the event organizer if they are also a group member', async () => {
      // Arrange - add organizer as a group member
      const groupMembersIncludingOrganizer = [
        ...mockGroupMembers,
        {
          id: 4,
          user: mockEvent.user, // Organizer is also a member
        },
      ];

      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'EventEntity') {
            return {
              findOne: jest.fn().mockResolvedValue(mockEvent),
            };
          } else if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue(groupMembersIncludingOrganizer),
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      // Should still only send 3 emails (Alice, Bob, and Carol), not to the organizer
      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);

      // Verify organizer didn't receive an email
      const emailCalls = mailerService.sendMjmlMail.mock.calls;
      const emailAddresses = emailCalls.map((call) => call[0].to);
      expect(emailAddresses).not.toContain('organizer@example.com');
    });

    it('should handle email sending failures gracefully for updates', async () => {
      // Arrange
      mailerService.sendMjmlMail.mockRejectedValueOnce(
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

      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);
    });

    it('should not send emails if updated event is not found', async () => {
      // Arrange - Mock repository to return null for non-existent event
      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'EventEntity') {
            return {
              findOne: jest.fn().mockResolvedValue(null),
            };
          } else if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue([]),
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventUpdated({
        eventId: 999,
        slug: 'non-existent-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert
      expect(mailerService.sendMjmlMail).not.toHaveBeenCalled();
    });

    it('should send cancellation emails when event status is cancelled', async () => {
      // Arrange - Mock event with cancelled status
      const cancelledEvent = { ...mockEvent, status: 'cancelled' };
      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'EventEntity') {
            return {
              findOne: jest.fn().mockResolvedValue(cancelledEvent),
            };
          } else if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue(mockGroupMembers),
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventUpdated({
        eventId: 1,
        slug: 'test-event',
        userId: 1,
        tenantId: 'test-tenant-123',
      });

      // Assert - should send cancellation emails, not update emails
      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);

      // Verify the emails use cancellation template and subject
      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'alice@example.com',
        subject: 'Cancelled Event: Test Event in Test Group',
        templateName: 'event/event-cancellation-announcement',
        context: {
          recipientName: 'Alice',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });
    });
  });

  describe('handleEventDeleted', () => {
    beforeEach(() => {
      mailerService.sendMjmlMail.mockResolvedValue(undefined);
    });

    it('should send deletion announcement emails to group members when an event is deleted', async () => {
      // Act
      await service.handleEventDeleted(mockEvent);

      // Assert - emails should be sent to group members
      // Should send emails to all members except the organizer (Alice, Bob, and Carol)
      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'alice@example.com',
        subject: 'Cancelled Event: Test Event in Test Group',
        templateName: 'event/event-cancellation-announcement',
        context: {
          recipientName: 'Alice',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'bob@example.com',
        subject: 'Cancelled Event: Test Event in Test Group',
        templateName: 'event/event-cancellation-announcement',
        context: {
          recipientName: 'Bob',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });

      expect(mailerService.sendMjmlMail).toHaveBeenCalledWith({
        to: 'carol@example.com',
        subject: 'Cancelled Event: Test Event in Test Group',
        templateName: 'event/event-cancellation-announcement',
        context: {
          recipientName: 'Carol',
          eventTitle: 'Test Event',
          eventDescription: 'A test event',
          eventDateTime: new Date('2025-07-01T10:00:00Z'),
          eventLocation: 'Test Location',
          groupName: 'Test Group',
          organizerName: 'John Doe',
          eventUrl: expect.stringContaining('/events/test-event'),
          groupUrl: expect.stringContaining('/groups/test-group'),
        },
        tenantConfig: expect.any(Object),
      });
    });

    it('should not send emails if the deleted event has no group', async () => {
      // Arrange - Event without group
      const eventWithoutGroup = { ...mockEvent, group: null };

      // Act
      await service.handleEventDeleted(eventWithoutGroup);

      // Assert
      expect(mailerService.sendMjmlMail).not.toHaveBeenCalled();
    });

    it('should not send emails if deleted event group has no members', async () => {
      // Arrange - Mock empty group members
      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue([]), // Empty group
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventDeleted(mockEvent);

      // Assert
      expect(mailerService.sendMjmlMail).not.toHaveBeenCalled();
    });

    it('should not send cancellation email to the event organizer if they are also a group member', async () => {
      // Arrange - add organizer as a group member
      const groupMembersIncludingOrganizer = [
        ...mockGroupMembers,
        {
          id: 4,
          user: mockEvent.user, // Organizer is also a member
        },
      ];

      tenantConnectionService.getTenantConnection.mockResolvedValueOnce({
        getRepository: jest.fn().mockImplementation((entityClass) => {
          if (entityClass.name === 'GroupMemberEntity') {
            return {
              find: jest.fn().mockResolvedValue(groupMembersIncludingOrganizer),
            };
          }
          return {};
        }),
      });

      // Act
      await service.handleEventDeleted(mockEvent);

      // Assert
      // Should still only send 3 emails (Alice, Bob, and Carol), not to the organizer
      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);

      // Verify organizer didn't receive an email
      const emailCalls = mailerService.sendMjmlMail.mock.calls;
      const emailAddresses = emailCalls.map((call) => call[0].to);
      expect(emailAddresses).not.toContain('organizer@example.com');
    });

    it('should handle email sending failures gracefully for cancellations', async () => {
      // Arrange
      mailerService.sendMjmlMail.mockRejectedValueOnce(
        new Error('SMTP server down'),
      );

      // Act & Assert - should not throw
      await expect(
        service.handleEventDeleted(mockEvent),
      ).resolves.not.toThrow();

      expect(mailerService.sendMjmlMail).toHaveBeenCalledTimes(3);
    });
  });
});
