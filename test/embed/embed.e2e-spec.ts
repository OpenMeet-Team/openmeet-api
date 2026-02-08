import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent, createGroup } from '../utils/functions';
import {
  EventType,
  EventVisibility,
  GroupVisibility,
  GroupStatus,
} from '../../src/core/constants/constant';

jest.setTimeout(60000);

describe('Embed Controller (e2e)', () => {
  let token: string;

  beforeAll(async () => {
    token = await loginAsTester();
  });

  describe('GET /api/embed/groups/:slug/events', () => {
    it('should return events for a public group', async () => {
      const group = await createGroup(TESTING_APP_URL, token, {
        name: `Embed Public Group ${Date.now()}`,
        description: 'Test group for embed widget',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      const event = await createEvent(TESTING_APP_URL, token, {
        name: `Embed Public Event ${Date.now()}`,
        description: 'Test event for embed widget',
        type: EventType.InPerson,
        location: 'Test Location',
        visibility: EventVisibility.Public,
        group: group.id,
      });

      const response = await request(TESTING_APP_URL)
        .get(`/api/embed/groups/${group.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.group).toBeDefined();
      expect(response.body.group.name).toBe(group.name);
      expect(response.body.group.slug).toBe(group.slug);
      expect(response.body.group.url).toContain(`/groups/${group.slug}`);
      expect(response.body.events).toBeInstanceOf(Array);
      expect(response.body.events.length).toBeGreaterThanOrEqual(1);
      expect(response.body.meta).toBeDefined();
      expect(response.body.meta.total).toBeGreaterThanOrEqual(1);
      expect(response.body.meta.limit).toBe(5);

      // Verify event shape
      const embedEvent = response.body.events.find(
        (e: any) => e.slug === event.slug,
      );
      expect(embedEvent).toBeDefined();
      expect(embedEvent.name).toBe(event.name);
      expect(embedEvent.startDate).toBeDefined();
      expect(embedEvent.url).toContain(`/events/${event.slug}`);
      expect(embedEvent.type).toBe(EventType.InPerson);
      expect(embedEvent.location).toBe('Test Location');
      expect(typeof embedEvent.attendeesCount).toBe('number');
      expect(embedEvent.timeZone).toBeDefined();

      // Verify CORS headers
      expect(response.headers['access-control-allow-origin']).toBe('*');

      // Verify cache headers
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('s-maxage=300');

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/events/${event.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should return events for an unlisted group', async () => {
      const group = await createGroup(TESTING_APP_URL, token, {
        name: `Embed Unlisted Group ${Date.now()}`,
        description: 'Unlisted group for embed',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Unlisted,
      });

      const event = await createEvent(TESTING_APP_URL, token, {
        name: `Embed Unlisted Event ${Date.now()}`,
        description: 'Event in unlisted group',
        type: EventType.Online,
        visibility: EventVisibility.Public,
        group: group.id,
      });

      const response = await request(TESTING_APP_URL)
        .get(`/api/embed/groups/${group.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/events/${event.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should return 404 for private groups', async () => {
      const group = await createGroup(TESTING_APP_URL, token, {
        name: `Embed Private Group ${Date.now()}`,
        description: 'Private group should be hidden',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Private,
      });

      const response = await request(TESTING_APP_URL)
        .get(`/api/embed/groups/${group.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group not found');

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should return empty events for group with no upcoming events', async () => {
      const group = await createGroup(TESTING_APP_URL, token, {
        name: `Embed Empty Group ${Date.now()}`,
        description: 'Group with no events',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      const response = await request(TESTING_APP_URL)
        .get(`/api/embed/groups/${group.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events).toEqual([]);
      expect(response.body.meta.total).toBe(0);

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should respect limit parameter', async () => {
      const group = await createGroup(TESTING_APP_URL, token, {
        name: `Embed Limit Group ${Date.now()}`,
        description: 'Group for testing limit',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Create 3 events with staggered start times
      const events = [];
      for (let i = 0; i < 3; i++) {
        const event = await createEvent(TESTING_APP_URL, token, {
          name: `Embed Limit Event ${i} ${Date.now()}`,
          description: `Event ${i}`,
          type: EventType.Online,
          visibility: EventVisibility.Public,
          group: group.id,
          startDate: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
        });
        events.push(event);
      }

      const response = await request(TESTING_APP_URL)
        .get(`/api/embed/groups/${group.slug}/events?limit=2`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events.length).toBeLessThanOrEqual(2);
      expect(response.body.meta.limit).toBe(2);

      // Cleanup
      for (const event of events) {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${event.id}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should exclude private events from results', async () => {
      const group = await createGroup(TESTING_APP_URL, token, {
        name: `Embed Mixed Vis Group ${Date.now()}`,
        description: 'Group with mixed visibility events',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      const publicEvent = await createEvent(TESTING_APP_URL, token, {
        name: `Embed Public Event ${Date.now()}`,
        description: 'Public event',
        type: EventType.InPerson,
        visibility: EventVisibility.Public,
        group: group.id,
      });

      const privateEvent = await createEvent(TESTING_APP_URL, token, {
        name: `Embed Private Event ${Date.now()}`,
        description: 'Private event should be hidden',
        type: EventType.InPerson,
        visibility: EventVisibility.Private,
        group: group.id,
      });

      const response = await request(TESTING_APP_URL)
        .get(`/api/embed/groups/${group.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      const slugs = response.body.events.map((e: any) => e.slug);
      expect(slugs).toContain(publicEvent.slug);
      expect(slugs).not.toContain(privateEvent.slug);

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/events/${publicEvent.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
      await request(TESTING_APP_URL)
        .delete(`/api/events/${privateEvent.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${group.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should return 404 for nonexistent group', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/embed/groups/nonexistent-group-slug-xyz/events')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/embed/widget.js', () => {
    it('should return JavaScript with correct content type', async () => {
      const response = await request(TESTING_APP_URL).get(
        '/api/embed/widget.js',
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(
        'application/javascript',
      );
      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age=3600');
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('should work without X-Tenant-ID header', async () => {
      const response = await request(TESTING_APP_URL).get(
        '/api/embed/widget.js',
      );

      // Should not get 400/403 for missing tenant
      expect(response.status).toBe(200);
    });
  });

  describe('CORS preflight', () => {
    it('should handle OPTIONS request with CORS headers', async () => {
      const response = await request(TESTING_APP_URL)
        .options('/api/embed/groups/any-group/events')
        .set('Origin', 'https://biz.openmeet.net')
        .set('Access-Control-Request-Method', 'GET')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-headers']).toContain(
        'X-Tenant-ID',
      );
    });
  });
});
