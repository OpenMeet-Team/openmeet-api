import request from 'supertest';
import { loginAsTester } from './../utils/functions';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';

describe('HomeController (e2e)', () => {
  const server = request
    .agent(TESTING_APP_URL)
    .set('x-tenant-id', TESTING_TENANT_ID);

  it('should return 401 error if no x-tenant-id is provided', () => {
    const server = request.agent(TESTING_APP_URL);
    return server.get('/api/home/guest').expect(401);
  });

  it('should return app info', () => {
    return server.get('/api/version').expect(200);
  });

  it('should return guest home state', () => {
    return server
      .get('/api/home/guest')
      .expect(200)
      .expect((res) => {
        expect(res.body.interests).toBeInstanceOf(Array);
        expect(res.body.categories).toBeInstanceOf(Array);
        expect(res.body.groups).toBeInstanceOf(Array);
        expect(res.body.events).toBeInstanceOf(Array);
      });
  });

  it('should return user home state', async () => {
    const mockJwtToken = await loginAsTester();
    return server
      .get('/api/home/user')
      .set('Authorization', `Bearer ${mockJwtToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.organizedGroups).toBeInstanceOf(Array);
        expect(res.body.nextHostedEvent).toBeInstanceOf(Object);
        expect(res.body.recentEventDrafts).toBeInstanceOf(Array);
        expect(res.body.upcomingEvents).toBeInstanceOf(Array);
        expect(res.body.memberGroups).toBeInstanceOf(Array);
        expect(res.body.interests).toBeInstanceOf(Array);
      });
  });
});
