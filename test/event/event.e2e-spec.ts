import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { UserService } from '../../src/user/user.service';
import { EventService } from '../../src/event/event.service';
import { GroupService } from '../../src/group/group.service';
import { REQUEST } from '@nestjs/core';

function generateUniqueEmail() {
  return `user_${Date.now()}@example.com`;
}

describe.skip('EventController (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let userService: UserService;
  let eventService: EventService;
  let groupService: GroupService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(REQUEST)
      .useValue({ headers: { 'tenant-id': '1' } })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = await moduleFixture.resolve<AuthService>(AuthService);
    userService = await moduleFixture.resolve<UserService>(UserService);
    eventService = await moduleFixture.resolve<EventService>(EventService);
    groupService = await moduleFixture.resolve<GroupService>(GroupService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/api/events/:id (GET)', () => {
    it('should return a single event by id', async () => {
      // Create a test user
      const email = generateUniqueEmail();
      const testUser = await userService.create({
        email: email,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(testUser).toBeDefined();
      expect(testUser.id).toBeDefined();
      expect(testUser.email).toBe(email);

      // Login to get JWT token
      const { token, user } = await authService.validateLogin({
        email: email,
        password: 'password123',
      });

      expect(token).toBeDefined();
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(email);

      // Create a test group
      const testGroup = await groupService.create(
        {
          name: 'Test Group',
          description: 'A test group',
          slug: 'test-group',
          location: 'Test Location',
          lat: 0,
          lon: 0,
        },
        user.id,
      );

      expect(testGroup).toBeDefined();
      expect(testGroup.id).toBeDefined();

      const req = request(app.getHttpServer())
        .post('/events')
        .set('tenant-id', '1')
        .set('Authorization', `Bearer ${token}`);

      const createEventResponse = await req.send({
        name: 'Test Event',
        description: 'Test Description',
        startDate: new Date(),
        type: 'IN_PERSON',
        location: 'Test Location',
        locationOnline: 'false',
        endDate: new Date(Date.now() + 3600000),
        maxAttendees: 50,
        categories: [],
        lat: 0,
        lon: 0,
        is_public: true,
        group: testGroup.id,
        userId: user.id,
      });

      console.log('createEventResponse.body', createEventResponse.body);
      expect(createEventResponse.status).toBe(201);

      const testEvent = createEventResponse.body;

      expect(testEvent).toBeDefined();
      expect(testEvent.id).toBeDefined();

      // Make request to get the event by id
      const response = await request(app.getHttpServer())
        .get(`/events/${testEvent.id}`)
        .set('tenant-id', '1')
        .set('Authorization', `Bearer ${token}`);

      console.log('response.body', response.body);
      expect(response.status).toBe(200);

      // Assertions
      expect(response.body.id).toBe(testEvent.id);
      expect(response.body.name).toBe('Test Event');
      expect(response.body.description).toBe('Test Description');
      expect(response.body.user.id).toBe(testUser.id);

      // Clean up
      await request(app.getHttpServer())
        .delete(`/events/${testEvent.id}`)
        .set('Authorization', `Bearer ${token}`);
      await request(app.getHttpServer())
        .delete(`/groups/${testGroup.id}`)
        .set('Authorization', `Bearer ${token}`);
      await request(app.getHttpServer())
        .delete(`/users/${testUser.id}`)
        .set('Authorization', `Bearer ${token}`);
    });

    it('should return 404 for non-existent event', async () => {
      // Create a test user
      const email = generateUniqueEmail();
      const testUser = await userService.create({
        email: email,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      // Login to get JWT token
      const { token } = await authService.validateLogin({
        email: email,
        password: 'password123',
      });

      // Make request with a non-existent event id
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/event/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      // Clean up
      await userService.remove(testUser.id);
    });
  });
});
