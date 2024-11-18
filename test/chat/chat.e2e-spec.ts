import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

describe.skip('Chat API Tests', () => {
  let token: string;

  const messageData = {
    message: 'Hello, this is a test message',
  };

  beforeAll(async () => {
    token = await loginAsTester();
  });

  it('should create a new message in the chat', async () => {
    const response = await request(TESTING_APP_URL)
      .post('/api/chat/')
      .send(messageData)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(201);
  });

  it('should retrieve chat messages for the user', async () => {
    const response = await request(TESTING_APP_URL)
      .get('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);
    if (response.body.length > 0) {
      expect(response.body[0]).toHaveProperty('message');
    }
  });

  it('should return 401 Unauthorized when fetching messages without token', async () => {
    const response = await request(TESTING_APP_URL)
      .get('/api/chat')
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(401);
  });

  it('should return 401 Unauthorized when creating a message without token', async () => {
    const response = await request(TESTING_APP_URL)
      .post('/api/chat')
      .send(messageData)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(401);
  });
});
