import { Test, TestingModule } from '@nestjs/testing';
import { CalendarFeedController } from './calendar-feed.controller';
import { CalendarFeedService } from './calendar-feed.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('CalendarFeedController', () => {
  let controller: CalendarFeedController;
  let mockCalendarFeedService: jest.Mocked<CalendarFeedService>;

  const mockUser: UserEntity = {
    id: 1,
    slug: 'test-user',
    email: 'test@example.com',
  } as UserEntity;

  beforeEach(async () => {
    mockCalendarFeedService = {
      getUserCalendarFeed: jest.fn(),
      getGroupCalendarFeed: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalendarFeedController],
      providers: [
        {
          provide: CalendarFeedService,
          useValue: mockCalendarFeedService,
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
      const userSlug = 'test-user';
      const mockIcal = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getUserCalendarFeed.mockResolvedValue(mockIcal);

      await controller.getUserCalendar(
        userSlug,
        mockResponse as any,
        undefined,
        undefined,
      );

      expect(mockCalendarFeedService.getUserCalendarFeed).toHaveBeenCalledWith(
        userSlug,
        undefined,
        undefined,
      );
      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Type',
        'text/calendar; charset=utf-8',
      );
      expect(mockResponse.set).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${userSlug}.ics"`,
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockIcal);
    });

    it('should pass date range parameters', async () => {
      const userSlug = 'test-user';
      const startDate = '2024-01-01';
      const endDate = '2024-12-31';
      const mockIcal = 'BEGIN:VCALENDAR...';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getUserCalendarFeed.mockResolvedValue(mockIcal);

      await controller.getUserCalendar(
        userSlug,
        mockResponse as any,
        startDate,
        endDate,
      );

      expect(mockCalendarFeedService.getUserCalendarFeed).toHaveBeenCalledWith(
        userSlug,
        startDate,
        endDate,
      );
    });

    it('should handle service errors', async () => {
      const userSlug = 'nonexistent-user';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getUserCalendarFeed.mockRejectedValue(
        new NotFoundException('User not found'),
      );

      await expect(
        controller.getUserCalendar(
          userSlug,
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
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getGroupCalendarFeed.mockResolvedValue(mockIcal);

      await controller.getGroupCalendar(
        groupSlug,
        {},
        mockResponse as any,
        undefined,
        undefined,
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
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getGroupCalendarFeed.mockResolvedValue(mockIcal);

      // Mock authenticated request
      await controller.getGroupCalendar(
        groupSlug,
        { user: mockUser },
        mockResponse as any,
        undefined,
        undefined,
      );

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
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getGroupCalendarFeed.mockResolvedValue(mockIcal);

      await controller.getGroupCalendar(
        groupSlug,
        {},
        mockResponse as any,
        startDate,
        endDate,
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
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getGroupCalendarFeed.mockRejectedValue(
        new ForbiddenException('Access denied to private group calendar'),
      );

      await expect(
        controller.getGroupCalendar(
          groupSlug,
          {},
          mockResponse as any,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle group not found', async () => {
      const groupSlug = 'nonexistent-group';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getGroupCalendarFeed.mockRejectedValue(
        new NotFoundException('Group not found'),
      );

      await expect(
        controller.getGroupCalendar(
          groupSlug,
          {},
          mockResponse as any,
          undefined,
          undefined,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('response headers', () => {
    it('should set correct iCalendar content type and filename', async () => {
      const slug = 'test-calendar';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getUserCalendarFeed.mockResolvedValue(
        'ical-content',
      );

      await controller.getUserCalendar(
        slug,
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
        `attachment; filename="${slug}.ics"`,
      );
    });

    it('should handle special characters in filename', async () => {
      const slug = 'test-group-with-special-chars';
      const mockResponse = {
        set: jest.fn(),
        send: jest.fn(),
      };

      mockCalendarFeedService.getGroupCalendarFeed.mockResolvedValue(
        'ical-content',
      );

      await controller.getGroupCalendar(
        slug,
        {},
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
