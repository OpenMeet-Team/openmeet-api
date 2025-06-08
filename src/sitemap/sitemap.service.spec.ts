import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SitemapService } from './sitemap.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import {
  EventStatus,
  EventVisibility,
  GroupVisibility,
} from '../core/constants/constant';

describe('SitemapService', () => {
  let service: SitemapService;
  let eventRepository: Repository<EventEntity>;
  let groupRepository: Repository<GroupEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SitemapService,
        {
          provide: getRepositoryToken(EventEntity),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(GroupEntity),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SitemapService>(SitemapService);
    eventRepository = module.get<Repository<EventEntity>>(
      getRepositoryToken(EventEntity),
    );
    groupRepository = module.get<Repository<GroupEntity>>(
      getRepositoryToken(GroupEntity),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicEvents', () => {
    it('should return only public published events', async () => {
      const mockEvents = [
        {
          slug: 'event-1',
          updatedAt: new Date('2023-01-01'),
          startDate: new Date('2023-12-01'),
        },
      ];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(mockEvents as any);

      const result = await service.getPublicEvents();

      expect(eventRepository.find).toHaveBeenCalledWith({
        where: {
          visibility: EventVisibility.Public,
          status: EventStatus.Published,
        },
        select: ['slug', 'updatedAt', 'startDate'],
        order: { updatedAt: 'DESC' },
      });
      expect(result).toEqual(mockEvents);
    });
  });

  describe('getPublicGroups', () => {
    it('should return only public groups', async () => {
      const mockGroups = [
        {
          slug: 'group-1',
          updatedAt: new Date('2023-01-01'),
        },
      ];

      jest.spyOn(groupRepository, 'find').mockResolvedValue(mockGroups as any);

      const result = await service.getPublicGroups();

      expect(groupRepository.find).toHaveBeenCalledWith({
        where: {
          visibility: GroupVisibility.Public,
        },
        select: ['slug', 'updatedAt'],
        order: { updatedAt: 'DESC' },
      });
      expect(result).toEqual(mockGroups);
    });
  });

  describe('generateSitemapUrls', () => {
    it('should generate URLs for events, groups, and static pages', async () => {
      const mockEvents = [
        {
          slug: 'event-1',
          updatedAt: new Date('2023-01-01'),
          startDate: new Date('2023-12-01'),
        },
      ];
      const mockGroups = [
        {
          slug: 'group-1',
          updatedAt: new Date('2023-01-01'),
        },
      ];

      jest.spyOn(service, 'getPublicEvents').mockResolvedValue(mockEvents as any);
      jest.spyOn(service, 'getPublicGroups').mockResolvedValue(mockGroups as any);

      const result = await service.generateSitemapUrls('https://example.com');

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            loc: 'https://example.com/events/event-1',
          }),
          expect.objectContaining({
            loc: 'https://example.com/groups/group-1',
          }),
          expect.objectContaining({
            loc: 'https://example.com/events',
          }),
          expect.objectContaining({
            loc: 'https://example.com/groups',
          }),
        ]),
      );
    });
  });

  describe('generateXmlSitemap', () => {
    it('should generate valid XML sitemap', () => {
      const urls = [
        {
          loc: 'https://example.com/events/event-1',
          lastmod: '2023-01-01T00:00:00.000Z',
          changefreq: 'daily' as const,
          priority: '1.0',
        },
      ];

      const result = service.generateXmlSitemap(urls);

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(result).toContain('<loc>https://example.com/events/event-1</loc>');
      expect(result).toContain('<lastmod>2023-01-01T00:00:00.000Z</lastmod>');
      expect(result).toContain('<changefreq>daily</changefreq>');
      expect(result).toContain('<priority>1.0</priority>');
      expect(result).toContain('</urlset>');
    });

    it('should escape XML special characters', () => {
      const urls = [
        {
          loc: 'https://example.com/events/event&test',
        },
      ];

      const result = service.generateXmlSitemap(urls);

      expect(result).toContain('<loc>https://example.com/events/event&amp;test</loc>');
    });
  });
});