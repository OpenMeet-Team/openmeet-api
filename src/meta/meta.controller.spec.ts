import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaController } from './meta.controller';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';
import { EventVisibility, GroupVisibility } from '../core/constants/constant';
import { REQUEST } from '@nestjs/core';

describe('MetaController', () => {
  let controller: MetaController;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, _options?: any) => {
      const config = {
        'app.frontendDomain': 'https://platform.openmeet.net',
        'file.cloudfrontDistributionDomain': 'ds1xtylbemsat.cloudfront.net',
        'file.driver': 'cloudfront',
        'app.backendDomain': 'https://api.openmeet.net',
      };
      return config[key];
    }),
  };

  const mockEventQueryService = {
    findEventBySlug: jest.fn(),
  };

  const mockGroupService = {
    findGroupBySlug: jest.fn(),
  };

  const mockRequest = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetaController],
      providers: [
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventQueryService, useValue: mockEventQueryService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();

    controller = module.get<MetaController>(MetaController);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('stripHtml', () => {
    it('should remove HTML tags from group descriptions', () => {
      const input = '<div><b>OpenMeet Guides</b></div>';
      const result = controller['stripHtml'](input);
      expect(result).toBe('OpenMeet Guides');
    });

    it('should decode common HTML entities', () => {
      const input = '&lt;div&gt;&amp;&nbsp;&quot;&#039;';
      const result = controller['stripHtml'](input);
      expect(result).toBe('<div>& "\'');
    });

    it('should handle mixed HTML and entities', () => {
      const input = '<p>Hello&nbsp;<b>world</b>&lt;test&gt;</p>&amp;more';
      const result = controller['stripHtml'](input);
      expect(result).toBe('Hello world<test>&more');
    });

    it('should normalize whitespace', () => {
      const input = '<p>Too   much    space</p>\n\n<div>here</div>';
      const result = controller['stripHtml'](input);
      expect(result).toBe('Too much space here');
    });

    it('should return empty string for null/undefined', () => {
      expect(controller['stripHtml'](null as any)).toBe('');
      expect(controller['stripHtml'](undefined as any)).toBe('');
      expect(controller['stripHtml']('')).toBe('');
    });

    it('should prevent double-escaping (Issue #1 regression test)', () => {
      // This was the actual bug: descriptions stored as HTML were being escaped twice
      const storedHtml = '&lt;div&gt;&lt;b&gt;Text&lt;/b&gt;&lt;/div&gt;';
      const stripped = controller['stripHtml'](storedHtml);
      const escaped = controller['escapeHtml'](stripped);

      // stripHtml should decode entities first, so we get clean HTML tags
      expect(stripped).toBe('<div><b>Text</b></div>');
      // Then escapeHtml properly escapes them once (not double-escaped)
      expect(escaped).toBe('&lt;div&gt;&lt;b&gt;Text&lt;/b&gt;&lt;/div&gt;');
    });
  });

  describe('escapeHtml', () => {
    it('should escape dangerous characters', () => {
      const input = '<script>alert("XSS")</script>';
      const result = controller['escapeHtml'](input);
      expect(result).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
      );
    });

    it('should handle all special characters', () => {
      const input = '& < > " \'';
      const result = controller['escapeHtml'](input);
      expect(result).toBe('&amp; &lt; &gt; &quot; &#039;');
    });

    it('should return empty string for null/undefined', () => {
      expect(controller['escapeHtml'](null as any)).toBe('');
      expect(controller['escapeHtml'](undefined as any)).toBe('');
      expect(controller['escapeHtml']('')).toBe('');
    });
  });

  describe('renderMetaHTML - Image URL Construction', () => {
    it('should construct CloudFront URLs correctly for groups (Issue #2 fix)', () => {
      const cloudfrontDomain = mockConfigService.get(
        'file.cloudfrontDistributionDomain',
      );
      const frontendDomain = mockConfigService.get('app.frontendDomain');

      const mockGroup = {
        name: 'Test Group',
        slug: 'test-group',
        description: 'A test group',
        visibility: GroupVisibility.Public,
        image: {
          path: 'tenant123/abc123.png',
        },
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      // Should construct full CloudFront URL, not malformed platform.openmeet.net URL
      const expectedImageUrl = `https://${cloudfrontDomain}/tenant123/abc123.png`;
      expect(html).toContain(expectedImageUrl);
      expect(html).not.toContain(`${frontendDomain}/tenant123`);
    });

    it('should use backend domain when file driver is not cloudfront', () => {
      const backendDomain = 'https://api.openmeet.net';
      const frontendDomain = 'https://platform.openmeet.net';

      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'file.driver') return 'local';
        if (key === 'app.backendDomain') return backendDomain;
        if (key === 'app.frontendDomain') return frontendDomain;
        return null;
      });

      const mockEvent = {
        name: 'Test Event',
        slug: 'test-event',
        description: 'A test event',
        visibility: EventVisibility.Public,
        image: {
          path: '/uploads/image.jpg',
        },
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      const expectedImageUrl = `${backendDomain}/uploads/image.jpg`;
      expect(html).toContain(expectedImageUrl);
    });

    it('should use default image when no image provided', () => {
      const frontendDomain = mockConfigService.get('app.frontendDomain');

      const mockGroup = {
        name: 'Test Group',
        slug: 'test-group',
        description: 'A test group',
        visibility: GroupVisibility.Public,
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      const expectedDefaultImage = `${frontendDomain}/default-og.jpg`;
      expect(html).toContain(expectedDefaultImage);
    });
  });

  describe('renderMetaHTML - Group Description Handling', () => {
    it('should strip HTML tags from group descriptions before rendering', () => {
      const mockGroup = {
        name: 'OpenMeet Guides',
        slug: 'openmeet-guides',
        description: '<div><b>OpenMeet Guides</b> contains helpful tips</div>',
        visibility: GroupVisibility.Public,
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      // Should show clean text, not HTML tags or escaped entities
      expect(html).toContain('OpenMeet Guides contains helpful tips');
      expect(html).not.toContain('&lt;div&gt;');
      expect(html).not.toContain('<div>');
      expect(html).not.toContain('&lt;b&gt;');
    });

    it('should handle plain text event descriptions without stripping', () => {
      const mockEvent = {
        name: 'Summer BBQ',
        slug: 'summer-bbq',
        description: 'Join us for grilling and games!',
        visibility: EventVisibility.Public,
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      expect(html).toContain('Join us for grilling and games!');
    });
  });

  describe('renderMetaHTML - LinkedIn Tags', () => {
    it('should include article:author tag when user data is available', () => {
      const mockEvent = {
        name: 'Test Event',
        slug: 'test-event',
        description: 'Test description',
        visibility: EventVisibility.Public,
        user: {
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      expect(html).toContain(
        '<meta property="article:author" content="John Doe" />',
      );
    });

    it('should fallback to createdBy for groups', () => {
      const mockGroup = {
        name: 'Test Group',
        slug: 'test-group',
        description: 'Test description',
        visibility: GroupVisibility.Public,
        createdBy: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
      };

      const html = controller['renderMetaHTML']('group', mockGroup);

      expect(html).toContain(
        '<meta property="article:author" content="Jane Smith" />',
      );
    });

    it('should include og:locale tag', () => {
      const mockEvent = {
        name: 'Test Event',
        slug: 'test-event',
        description: 'Test description',
        visibility: EventVisibility.Public,
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      expect(html).toContain('<meta property="og:locale" content="en_US" />');
    });

    it('should include og:site_name tag', () => {
      const mockEvent = {
        name: 'Test Event',
        slug: 'test-event',
        description: 'Test description',
        visibility: EventVisibility.Public,
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      expect(html).toContain(
        '<meta property="og:site_name" content="OpenMeet" />',
      );
    });

    it('should include article:published_time based on createdAt', () => {
      const createdAt = new Date('2025-01-15T10:00:00Z');
      const startDate = new Date('2025-06-14T14:00:00Z');
      const mockEvent = {
        name: 'Summer BBQ',
        slug: 'summer-bbq',
        description: 'Test event',
        visibility: EventVisibility.Public,
        createdAt,
        startDate,
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Published time should be when event was created, not when it starts
      expect(html).toContain('<meta property="article:published_time"');
      expect(html).toContain('2025-01-15T10:00:00.000Z');

      // Event start time should still be the event's actual start date
      expect(html).toContain('<meta property="event:start_time"');
      expect(html).toContain('2025-06-14T14:00:00.000Z');
    });
  });

  describe('renderMetaHTML - Security', () => {
    it('should escape user-generated content to prevent XSS', () => {
      const mockEvent = {
        name: '<script>alert("XSS")</script>',
        slug: 'test-event',
        description: '<img src=x onerror=alert(1)> Some text here',
        visibility: EventVisibility.Public,
        location: '<script>alert("location")</script>',
      };

      const html = controller['renderMetaHTML']('event', mockEvent);

      // Should not contain unescaped script tags
      expect(html).not.toContain('<script>alert("XSS")');
      expect(html).not.toContain('<img src=x onerror');

      // Should contain escaped versions in meta tags and body
      expect(html).toContain(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
      );
      expect(html).toContain(
        '&lt;script&gt;alert(&quot;location&quot;)&lt;/script&gt;',
      );

      // Description should have HTML stripped, leaving just the text
      expect(html).toContain('Some text here');
    });
  });

  describe('Event Link Previews - Bot Access Behavior', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };
    });

    it('should allow bots to generate rich link previews for public events', async () => {
      const mockEvent = {
        slug: 'yoga-workshop',
        name: 'Beginner Yoga Workshop',
        description: 'Join us for a relaxing yoga session',
        visibility: EventVisibility.Public,
        location: 'Downtown Studio',
        startDate: new Date('2025-06-14T14:00:00Z'),
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('yoga-workshop', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      expect(sentHtml).toContain('Beginner Yoga Workshop');
      expect(sentHtml).toContain('Join us for a relaxing yoga session');
      expect(sentHtml).toContain('Downtown Studio');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should allow WhatsApp/Discord bots to preview authenticated (unlisted) events', async () => {
      const mockEvent = {
        slug: 'private-birthday-party',
        name: "Emma's 6th Birthday",
        description: 'Join us for cake and games!',
        visibility: EventVisibility.Authenticated,
        location: '123 Main St',
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('private-birthday-party', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      // Check for HTML-escaped version (apostrophes are escaped as &#039;)
      expect(sentHtml).toContain('Emma&#039;s 6th Birthday');
      expect(sentHtml).toContain('Join us for cake and games!');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should prevent search engines from indexing authenticated events', async () => {
      const mockEvent = {
        slug: 'semi-private-event',
        name: 'Semi-Private Event',
        description: 'Only for those with the link',
        visibility: EventVisibility.Authenticated,
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('semi-private-event', mockResponse);

      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-Robots-Tag': 'noindex, nofollow',
        }),
      );
    });

    it('should allow search engines to index public events', async () => {
      const mockEvent = {
        slug: 'public-meetup',
        name: 'Public Meetup',
        description: 'Everyone welcome!',
        visibility: EventVisibility.Public,
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('public-meetup', mockResponse);

      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-Robots-Tag': 'index, follow',
        }),
      );
    });

    it('should hide private events completely from bots', async () => {
      const mockEvent = {
        slug: 'secret-meeting',
        name: 'Secret Meeting',
        description: 'Top secret content',
        visibility: EventVisibility.Private,
      };

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      await controller.getEventMeta('secret-meeting', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.send).toHaveBeenCalledWith('Event not found');
      const sentContent = mockResponse.send.mock.calls[0][0];
      expect(sentContent).not.toContain('Secret Meeting');
      expect(sentContent).not.toContain('Top secret content');
    });

    it('should return generic 404 for non-existent events without leaking information', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValue(null);

      await controller.getEventMeta('non-existent', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.send).toHaveBeenCalledWith('Event not found');
    });
  });

  describe('Group Link Previews - Bot Access Behavior', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };
    });

    it('should allow bots to generate rich link previews for public groups', async () => {
      const mockGroup = {
        slug: 'photography-club',
        name: 'Photography Club',
        description: 'For photography enthusiasts',
        visibility: GroupVisibility.Public,
      };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup);

      await controller.getGroupMeta('photography-club', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      expect(sentHtml).toContain('Photography Club');
      expect(sentHtml).toContain('For photography enthusiasts');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should allow link preview bots to preview authenticated groups', async () => {
      const mockGroup = {
        slug: 'book-club',
        name: 'Secret Book Club',
        description: 'Monthly book discussions',
        visibility: GroupVisibility.Authenticated,
      };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup);

      await controller.getGroupMeta('book-club', mockResponse);

      const sentHtml = mockResponse.send.mock.calls[0][0];
      expect(sentHtml).toContain('Secret Book Club');
      expect(sentHtml).toContain('Monthly book discussions');
      expect(mockResponse.status).not.toHaveBeenCalledWith(404);
    });

    it('should prevent search engines from indexing authenticated groups', async () => {
      const mockGroup = {
        slug: 'invite-only-group',
        name: 'Invite Only Group',
        description: 'Link sharing only',
        visibility: GroupVisibility.Authenticated,
      };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup);

      await controller.getGroupMeta('invite-only-group', mockResponse);

      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-Robots-Tag': 'noindex, nofollow',
        }),
      );
    });

    it('should hide private groups completely from bots', async () => {
      const mockGroup = {
        slug: 'secret-society',
        name: 'Secret Society',
        description: 'Members only',
        visibility: GroupVisibility.Private,
      };

      mockGroupService.findGroupBySlug.mockResolvedValue(mockGroup);

      await controller.getGroupMeta('secret-society', mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.send).toHaveBeenCalledWith('Group not found');
      const sentContent = mockResponse.send.mock.calls[0][0];
      expect(sentContent).not.toContain('Secret Society');
      expect(sentContent).not.toContain('Members only');
    });
  });
});
