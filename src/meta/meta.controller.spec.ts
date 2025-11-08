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
    get: jest.fn((key: string) => {
      const config = {
        FRONTEND_DOMAIN: 'https://platform.openmeet.net',
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
      const frontendDomain = mockConfigService.get('FRONTEND_DOMAIN');

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
        if (key === 'FRONTEND_DOMAIN') return frontendDomain;
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
      const frontendDomain = mockConfigService.get('FRONTEND_DOMAIN');

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
});
