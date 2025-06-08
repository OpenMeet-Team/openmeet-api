import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import { SitemapService } from './sitemap.service';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';

const parseXml = promisify(parseString);

describe('SitemapService', () => {
  let service: SitemapService;
  let eventQueryService: jest.Mocked<EventQueryService>;
  let groupService: jest.Mocked<GroupService>;

  beforeEach(async () => {
    const mockEventQueryService = {
      showAllEvents: jest.fn(),
    };

    const mockGroupService = {
      showAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SitemapService,
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant' },
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
      ],
    }).compile();

    service = await module.resolve<SitemapService>(SitemapService);
    eventQueryService = module.get(EventQueryService);
    groupService = module.get(GroupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicEvents', () => {
    it('should return events with 5+ attendees after filtering', async () => {
      const mockEvents = [
        {
          slug: 'event-1',
          updatedAt: new Date('2023-01-01'),
          startDate: new Date('2023-12-01'),
          attendeesCount: 7,
        },
        {
          slug: 'event-2',
          updatedAt: new Date('2023-01-02'),
          startDate: new Date('2023-12-02'),
          attendeesCount: 3, // This should be filtered out
        },
      ];

      eventQueryService.showAllEvents.mockResolvedValue({
        data: mockEvents,
        total: mockEvents.length,
      });

      const result = await service.getPublicEvents('test-tenant');

      expect(eventQueryService.showAllEvents).toHaveBeenCalledWith(
        { page: 1, limit: 1000 },
        expect.objectContaining({
          fromDate: expect.any(String),
          toDate: expect.any(String),
          includeRecurring: true,
          expandRecurring: false,
        }),
        undefined,
      );
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('event-1');
    });
  });

  describe('getPublicGroups', () => {
    it('should return groups with 3+ members after filtering', async () => {
      const mockGroups = [
        {
          slug: 'group-1',
          updatedAt: new Date('2023-01-01'),
          groupMembersCount: 5,
        },
        {
          slug: 'group-2',
          updatedAt: new Date('2023-01-02'),
          groupMembersCount: 2, // This should be filtered out
        },
      ];

      groupService.showAll.mockResolvedValue({
        data: mockGroups,
        total: mockGroups.length,
      });

      const result = await service.getPublicGroups('test-tenant');

      expect(groupService.showAll).toHaveBeenCalledWith(
        { page: 1, limit: 1000 },
        {},
        undefined,
      );
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('group-1');
    });
  });

  describe('generateSitemapUrls', () => {
    it('should generate URLs for events, groups, and static pages', async () => {
      const mockEvents = [
        {
          slug: 'event-1',
          updatedAt: new Date('2023-01-01'),
          startDate: new Date('2023-12-01'),
          attendeesCount: 7,
        },
      ];
      const mockGroups = [
        {
          slug: 'group-1',
          updatedAt: new Date('2023-01-01'),
          groupMembersCount: 5,
        },
      ];

      eventQueryService.showAllEvents.mockResolvedValue({
        data: mockEvents,
        total: mockEvents.length,
      });

      groupService.showAll.mockResolvedValue({
        data: mockGroups,
        total: mockGroups.length,
      });

      const result = await service.generateSitemapUrls('https://example.com', 'test-tenant');

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
      expect(result).toContain(
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      );
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

      expect(result).toContain(
        '<loc>https://example.com/events/event&amp;test</loc>',
      );
    });
  });

  describe('XML validation', () => {
    it('should generate valid XML that can be parsed', async () => {
      const urls = [
        {
          loc: 'https://example.com/events/event-1',
          lastmod: '2023-01-01T00:00:00.000Z',
          changefreq: 'daily' as const,
          priority: '1.0',
        },
        {
          loc: 'https://example.com/groups/group-1',
          lastmod: '2023-01-01T00:00:00.000Z',
          changefreq: 'weekly' as const,
          priority: '0.8',
        },
      ];

      const xmlString = service.generateXmlSitemap(urls);

      // Should not throw when parsing
      const parsedXml = await parseXml(xmlString);

      expect(parsedXml).toBeDefined();
      expect(parsedXml.urlset).toBeDefined();
      expect(parsedXml.urlset.url).toHaveLength(2);
    });

    it('should generate XML with correct structure and namespace', async () => {
      const urls = [
        {
          loc: 'https://example.com/test',
          lastmod: '2023-01-01T00:00:00.000Z',
          changefreq: 'daily' as const,
          priority: '1.0',
        },
      ];

      const xmlString = service.generateXmlSitemap(urls);
      const parsedXml = await parseXml(xmlString);

      // Check root element
      expect(parsedXml.urlset).toBeDefined();
      expect(parsedXml.urlset.$).toEqual({
        xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9',
      });

      // Check URL structure
      const url = parsedXml.urlset.url[0];
      expect(url.loc[0]).toBe('https://example.com/test');
      expect(url.lastmod[0]).toBe('2023-01-01T00:00:00.000Z');
      expect(url.changefreq[0]).toBe('daily');
      expect(url.priority[0]).toBe('1.0');
    });

    it('should generate valid XML even with special characters', async () => {
      const urls = [
        {
          loc: 'https://example.com/events/café&bar<test>',
          lastmod: '2023-01-01T00:00:00.000Z',
        },
      ];

      const xmlString = service.generateXmlSitemap(urls);

      // Should not throw when parsing
      const parsedXml = await parseXml(xmlString);

      expect(parsedXml).toBeDefined();
      expect(parsedXml.urlset.url[0].loc[0]).toBe(
        'https://example.com/events/café&bar<test>',
      );
    });

    it('should generate XML with minimal URL data', async () => {
      const urls = [
        {
          loc: 'https://example.com/minimal',
        },
      ];

      const xmlString = service.generateXmlSitemap(urls);
      const parsedXml = await parseXml(xmlString);

      const url = parsedXml.urlset.url[0];
      expect(url.loc[0]).toBe('https://example.com/minimal');
      expect(url.lastmod).toBeUndefined();
      expect(url.changefreq).toBeUndefined();
      expect(url.priority).toBeUndefined();
    });
  });
});
