import { Test, TestingModule } from '@nestjs/testing';
import { CalendarFeedController } from './calendar-feed.controller';
import { CalendarFeedService } from './calendar-feed.service';
import { AuthService } from '../auth/auth.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('CalendarFeedController', () => {
  let controller: CalendarFeedController;
  let mockCalendarFeedService: jest.Mocked<CalendarFeedService>;
  let mockAuthService: jest.Mocked<AuthService>;

  const mockUser: UserEntity = {
    id: 1,
    slug: 'test-user',
    email: 'test@example.com',
  } as UserEntity;

  beforeEach(async () => {
    mockCalendarFeedService = {
      getUserCalendarFeed: jest.fn(),
      getGroupCalendarFeed: jest.fn(),
      findGroupBySlug: jest.fn(),
    } as any;

    mockAuthService = {
      getGroupMemberByUserSlugAndGroupSlug: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalendarFeedController],
      providers: [
        {
          provide: CalendarFeedService,
          useValue: mockCalendarFeedService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = await module.resolve<CalendarFeedController>(
      CalendarFeedController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserCalendar', () => {
    it('should return user calendar iCal with correct content type', async () => {
      const mockUser = {
        id: 1,
        slug: 'test-user',
      } as UserEntity;
      const mockIcal = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getUserCalendarFeed.mockResolvedValue(mockIcal);

      await controller.getUserCalendar(
        mockUser,
        mockResponse as any,
        undefined,
        undefined,
      );

      expect(mockCalendarFeedService.getUserCalendarFeed).toHaveBeenCalledWith(
        mockUser.id,
        undefined,
        undefined,
      );
      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Type',
        'text/calendar; charset=utf-8',
      );
      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${mockUser.slug}.ics"`,
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockIcal);
    });

    it('should pass date range parameters', async () => {
      const mockUser = {
        id: 1,
        slug: 'test-user',
      } as UserEntity;
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const mockIcal = 'BEGIN:VCALENDAR...';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getUserCalendarFeed.mockResolvedValue(mockIcal);

      await controller.getUserCalendar(
        mockUser,
        mockResponse as any,
        startDate,
        endDate,
      );

      expect(mockCalendarFeedService.getUserCalendarFeed).toHaveBeenCalledWith(
        mockUser.id,
        startDate,
        endDate,
      );
    });

    it('should handle service errors', async () => {
      const mockUser = {
        id: 999,
        slug: 'nonexistent-user',
      } as UserEntity;
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getUserCalendarFeed.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        controller.getUserCalendar(
          mockUser,
          mockResponse as any,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getGroupCalendar', () => {
    it('should return group calendar iCal for public groups', async () => {
      const groupSlug = 'test-group';
      const mockIcal = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
      const mockGroup = { id: 1, slug: groupSlug, visibility: 'public' };
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      // Mock the security flow
      mockCalendarFeedService.findGroupBySlug.mockResolvedValue(
        mockGroup as any,
      );
      mockCalendarFeedService.getGroupCalendarFeed.mockResolvedValue(mockIcal);

      await controller.getGroupCalendar(
        groupSlug,
        { headers: { 'x-tenant-id': 'test-tenant' } },
        mockResponse as any,
        undefined,
        undefined,
      );

      expect(mockCalendarFeedService.findGroupBySlug).toHaveBeenCalledWith(
        groupSlug,
      );
      expect(mockCalendarFeedService.getGroupCalendarFeed).toHaveBeenCalledWith(
        groupSlug,
        undefined,
        undefined,
        undefined, // userId
      );
      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Type',
        'text/calendar; charset=utf-8',
      );
      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${groupSlug}.ics"`,
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockIcal);
    });

    it('should include user ID for authenticated requests', async () => {
      const groupSlug = 'private-group';
      const mockIcal = 'BEGIN:VCALENDAR...';
      const mockGroup = { id: 1, slug: groupSlug, visibility: 'private' };
      const mockGroupMember = {
        id: 1,
        groupRole: {
          groupPermissions: [{ name: 'SEE_EVENTS' }],
        },
      };
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      // Mock the security flow for private group with member access
      mockCalendarFeedService.findGroupBySlug.mockResolvedValue(
        mockGroup as any,
      );
      mockAuthService.getGroupMemberByUserSlugAndGroupSlug.mockResolvedValue(
        mockGroupMember as any,
      );
      mockCalendarFeedService.getGroupCalendarFeed.mockResolvedValue(mockIcal);

      // Mock authenticated request
      await controller.getGroupCalendar(
        groupSlug,
        { user: mockUser, headers: { 'x-tenant-id': 'test-tenant' } },
        mockResponse as any,
        undefined,
        undefined,
      );

      expect(mockCalendarFeedService.findGroupBySlug).toHaveBeenCalledWith(
        groupSlug,
      );
      expect(
        mockAuthService.getGroupMemberByUserSlugAndGroupSlug,
      ).toHaveBeenCalledWith(mockUser.slug, groupSlug);
      expect(mockCalendarFeedService.getGroupCalendarFeed).toHaveBeenCalledWith(
        groupSlug,
        undefined,
        undefined,
        mockUser.id, // Should include user ID
      );
    });

    it('should pass date range parameters for group calendar', async () => {
      const groupSlug = 'test-group';
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const mockIcal = 'BEGIN:VCALENDAR...';
      const mockGroup = { id: 1, slug: groupSlug, visibility: 'public' };
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      // Mock the security flow
      mockCalendarFeedService.findGroupBySlug.mockResolvedValue(
        mockGroup as any,
      );
      mockCalendarFeedService.getGroupCalendarFeed.mockResolvedValue(mockIcal);

      await controller.getGroupCalendar(
        groupSlug,
        { headers: { 'x-tenant-id': 'test-tenant' } },
        mockResponse as any,
        startDate,
        endDate,
      );

      expect(mockCalendarFeedService.findGroupBySlug).toHaveBeenCalledWith(
        groupSlug,
      );
      expect(mockCalendarFeedService.getGroupCalendarFeed).toHaveBeenCalledWith(
        groupSlug,
        startDate,
        endDate,
        undefined,
      );
    });

    it('should handle private group access denial', async () => {
      const groupSlug = 'private-group';
      const mockGroup = { id: 1, slug: groupSlug, visibility: 'private' };
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      // Mock the security flow - group exists but no access (unauthenticated)
      mockCalendarFeedService.findGroupBySlug.mockResolvedValue(
        mockGroup as any,
      );

      await expect(
        controller.getGroupCalendar(
          groupSlug,
          { headers: { 'x-tenant-id': 'test-tenant' } }, // No user (unauthenticated)
          mockResponse as any,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockCalendarFeedService.findGroupBySlug).toHaveBeenCalledWith(
        groupSlug,
      );
      // Should not call getGroupCalendarFeed due to access denial
      expect(
        mockCalendarFeedService.getGroupCalendarFeed,
      ).not.toHaveBeenCalled();
    });

    it('should handle group not found', async () => {
      const groupSlug = 'nonexistent-group';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      // Mock the security flow - group not found
      mockCalendarFeedService.findGroupBySlug.mockResolvedValue(null);

      await expect(
        controller.getGroupCalendar(
          groupSlug,
          { headers: { 'x-tenant-id': 'test-tenant' } },
          mockResponse as any,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockCalendarFeedService.findGroupBySlug).toHaveBeenCalledWith(
        groupSlug,
      );
      // Should not call getGroupCalendarFeed due to group not found
      expect(
        mockCalendarFeedService.getGroupCalendarFeed,
      ).not.toHaveBeenCalled();
    });
  });

  describe('response headers', () => {
    it('should set correct iCalendar content type and filename', async () => {
      const mockUser = {
        id: 1,
        slug: 'test-calendar',
      } as UserEntity;
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getUserCalendarFeed.mockResolvedValue(
        'ical-content',
      );

      await controller.getUserCalendar(
        mockUser,
        mockResponse as any,
        undefined,
        undefined,
      );

      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Type',
        'text/calendar; charset=utf-8',
      );
      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${mockUser.slug}.ics"`,
      );
    });

    it('should handle special characters in filename', async () => {
      const slug = 'test-group-with-special-chars';
      const mockGroup = { id: 1, slug, visibility: 'public' };
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      // Mock the security flow
      mockCalendarFeedService.findGroupBySlug.mockResolvedValue(
        mockGroup as any,
      );
      mockCalendarFeedService.getGroupCalendarFeed.mockResolvedValue(
        'ical-content',
      );

      await controller.getGroupCalendar(
        slug,
        { headers: { 'x-tenant-id': 'test-tenant' } },
        mockResponse as any,
        undefined,
        undefined,
      );

      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${slug}.ics"`,
      );
    });
  });
});
