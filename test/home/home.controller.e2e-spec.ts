import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module'; // Adjust the path as necessary

describe('HomeController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should return app info', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Expected response from appInfo');
  });

  it('should return guest home state', () => {
    return request(app.getHttpServer())
      .get('/home/guest')
      .expect(200)
      .expect('Expected response from getGuestHomeState');
  });

  it('should return user home state', () => {
    const mockJwtToken = 'your.jwt.token.here';
    return request(app.getHttpServer())
      .get('/home/user')
      .set('Authorization', `Bearer ${mockJwtToken}`)
      .expect(200)
      .expect('Expected response from getUserHomeState');
  });

  afterEach(async () => {
    await app.close();
  });
});
