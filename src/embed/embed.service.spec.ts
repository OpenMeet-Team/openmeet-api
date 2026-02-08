import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EmbedService } from './embed.service';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';
import {
  EventVisibility,
  GroupVisibility,
  EventType,
} from '../core/constants/constant';

describe('EmbedService', () => {
  let service: EmbedService;
  let groupService: jest.Mocked<Partial<GroupService>>;
  let eventQueryService: jest.Mocked<Partial<EventQueryService>>;
  let configService: jest.Mocked<Partial<ConfigService>>;

  const mockGroup = {
    id: 1,
    slug: 'test-group',
    name: 'Test Group',
    visibility: GroupVisibility.Public,
    image: { path: 'tenant/group-image.jpg' },
  };

  const mockEvents = [
    {
      id: 1,
      slug: 'event-1',
      name: 'Public Event',
      description: '<p>Hello <b>world</b></p>',
      startDate: new Date('2026-03-01T18:00:00Z'),
      endDate: new Date('2026-03-01T20:00:00Z'),
      timeZone: 'America/New_York',
      location: 'NYC',
      type: EventType.InPerson,
      visibility: EventVisibility.Public,
      image: { path: 'tenant/event-1.jpg' },
      attendeesCount: 10,
    },
    {
      id: 2,
      slug: 'event-2',
      name: 'Private Event',
      description: 'Should be filtered out',
      startDate: new Date('2026-03-02T18:00:00Z'),
      endDate: null,
      timeZone: 'UTC',
      location: null,
      type: EventType.Online,
      visibility: EventVisibility.Private,
      image: null,
      attendeesCount: 5,
    },
    {
      id: 3,
      slug: 'event-3',
      name: 'Unlisted Event',
      description: 'Visible to embed',
      startDate: new Date('2026-03-03T18:00:00Z'),
      endDate: null,
      timeZone: 'UTC',
      location: null,
      type: EventType.Online,
      visibility: EventVisibility.Unlisted,
      image: null,
      attendeesCount: 0,
    },
  ];

  beforeEach(async () => {
    groupService = {
      findGroupBySlug: jest.fn(),
    };

    eventQueryService = {
      findUpcomingEventsForGroup: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const map: Record<string, string> = {
          'app.frontendDomain': 'https://platform.openmeet.net',
          'file.cloudfrontDistributionDomain': 'cdn.example.com',
          'file.driver': 'cloudfront',
          'app.backendDomain': 'https://api.openmeet.net',
        };
        return map[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbedService,
        { provide: GroupService, useValue: groupService },
        { provide: EventQueryService, useValue: eventQueryService },
        { provide: ConfigService, useValue: configService },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();

    service = await module.resolve<EmbedService>(EmbedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGroupEvents', () => {
    it('should return events for a public group', async () => {
      groupService.findGroupBySlug!.mockResolvedValue(mockGroup as any);
      eventQueryService.findUpcomingEventsForGroup!.mockResolvedValue(
        mockEvents as any,
      );

      const result = await service.getGroupEvents('test-group', 5);

      expect(result.group.name).toBe('Test Group');
      expect(result.group.slug).toBe('test-group');
      expect(result.group.url).toBe(
        'https://platform.openmeet.net/groups/test-group',
      );
      // Should filter out private event (id:2) but keep public (id:1) and unlisted (id:3)
      expect(result.events).toHaveLength(2);
      expect(result.events[0].slug).toBe('event-1');
      expect(result.events[1].slug).toBe('event-3');
    });

    it('should strip HTML from descriptions', async () => {
      groupService.findGroupBySlug!.mockResolvedValue(mockGroup as any);
      eventQueryService.findUpcomingEventsForGroup!.mockResolvedValue(
        mockEvents as any,
      );

      const result = await service.getGroupEvents('test-group', 5);

      expect(result.events[0].description).toBe('Hello world');
    });

    it('should build CloudFront image URLs', async () => {
      groupService.findGroupBySlug!.mockResolvedValue(mockGroup as any);
      eventQueryService.findUpcomingEventsForGroup!.mockResolvedValue(
        mockEvents as any,
      );

      const result = await service.getGroupEvents('test-group', 5);

      expect(result.events[0].imageUrl).toBe(
        'https://cdn.example.com/tenant/event-1.jpg',
      );
    });

    it('should return null imageUrl when no image', async () => {
      groupService.findGroupBySlug!.mockResolvedValue(mockGroup as any);
      eventQueryService.findUpcomingEventsForGroup!.mockResolvedValue(
        mockEvents as any,
      );

      const result = await service.getGroupEvents('test-group', 5);

      // event-3 (unlisted) has no image
      expect(result.events[1].imageUrl).toBeNull();
    });

    it('should throw NotFoundException for private groups', async () => {
      groupService.findGroupBySlug!.mockResolvedValue({
        ...mockGroup,
        visibility: GroupVisibility.Private,
      } as any);

      await expect(service.getGroupEvents('private-group', 5)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow unlisted groups', async () => {
      groupService.findGroupBySlug!.mockResolvedValue({
        ...mockGroup,
        visibility: GroupVisibility.Unlisted,
      } as any);
      eventQueryService.findUpcomingEventsForGroup!.mockResolvedValue([]);

      const result = await service.getGroupEvents('unlisted-group', 5);

      expect(result.group.name).toBe('Test Group');
      expect(result.events).toHaveLength(0);
    });

    it('should include correct meta', async () => {
      groupService.findGroupBySlug!.mockResolvedValue(mockGroup as any);
      eventQueryService.findUpcomingEventsForGroup!.mockResolvedValue([]);

      const result = await service.getGroupEvents('test-group', 5);

      expect(result.meta.total).toBe(0);
      expect(result.meta.limit).toBe(5);
      expect(result.meta.platformUrl).toBe('https://platform.openmeet.net');
    });

    it('should build event URLs correctly', async () => {
      groupService.findGroupBySlug!.mockResolvedValue(mockGroup as any);
      eventQueryService.findUpcomingEventsForGroup!.mockResolvedValue(
        mockEvents as any,
      );

      const result = await service.getGroupEvents('test-group', 5);

      expect(result.events[0].url).toBe(
        'https://platform.openmeet.net/events/event-1',
      );
    });

    it('should use backend domain for image URLs when not using cloudfront', async () => {
      configService.get!.mockImplementation((key: string) => {
        const map: Record<string, string | undefined> = {
          'app.frontendDomain': 'https://platform.openmeet.net',
          'file.cloudfrontDistributionDomain': undefined,
          'file.driver': 's3',
          'app.backendDomain': 'https://api.openmeet.net',
        };
        return map[key];
      });

      groupService.findGroupBySlug!.mockResolvedValue(mockGroup as any);
      eventQueryService.findUpcomingEventsForGroup!.mockResolvedValue(
        mockEvents as any,
      );

      const result = await service.getGroupEvents('test-group', 5);

      expect(result.events[0].imageUrl).toBe(
        'https://api.openmeet.net/tenant/event-1.jpg',
      );
    });
  });
});
