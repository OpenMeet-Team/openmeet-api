import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from './health.controller';
import {
  HealthCheckError,
  HealthCheckService,
  HttpHealthIndicator,
  TerminusModule,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { MatrixHealthIndicator } from '../matrix/health/matrix.health';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  let dbIndicator: { pingCheck: jest.Mock };
  let matrixIndicator: { isHealthy: jest.Mock };

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn(),
    } as any;
    dbIndicator = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };
    matrixIndicator = {
      isHealthy: jest.fn().mockResolvedValue({
        status: 'up',
        matrix: {
          serverAvailable: true,
          tokenState: 'valid',
          tokenValid: true,
          adminPrivilegesValid: true,
          serverUrl: 'https://matrix.example.org',
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: healthCheckService,
        },
        {
          provide: HttpHealthIndicator,
          useValue: {},
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: dbIndicator,
        },
        {
          provide: MatrixHealthIndicator,
          useValue: matrixIndicator,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('readiness', () => {
    it('should return status ok when database is connected', async () => {
      jest.spyOn(healthCheckService, 'check').mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' } },
        details: { database: { status: 'up' } },
      });

      const result = await controller.readiness();
      expect(result).toEqual({
        status: 'ok',
        details: { database: { status: 'up' } },
        info: { database: { status: 'up' } },
      });
    });

    it('should propagate the ServiceUnavailableException when the database is disconnected, so the probe sees a 503', async () => {
      // health.check() throws ServiceUnavailableException on a failed check;
      // readiness must let it reach the HTTP layer instead of returning a 200 body.
      const error = new Error('Health Check has failed!');
      jest.spyOn(healthCheckService, 'check').mockRejectedValue(error);

      await expect(controller.readiness()).rejects.toBe(error);
    });

    it('should gate on the database only — matrix is not part of readiness', async () => {
      // Decision (TS, 2026-08-23): a Matrix outage degrades chat, not the API,
      // and must not pull api pods out of the Service endpoints.
      jest
        .spyOn(healthCheckService, 'check')
        .mockImplementation(async (checks) => {
          for (const check of checks) {
            await check();
          }
          return { status: 'ok' } as any;
        });

      await controller.readiness();

      expect(dbIndicator.pingCheck).toHaveBeenCalledWith('database');
      expect(matrixIndicator.isHealthy).not.toHaveBeenCalled();
    });
  });

  describe('liveness', () => {
    it('should return status ok when api and docs are reachable', async () => {
      jest.spyOn(healthCheckService, 'check').mockResolvedValue({
        status: 'ok',
        details: {
          'api-root': { status: 'up' },
          'docs-root': { status: 'up' },
        },
      });
      const result = await controller.liveness();
      expect(result).toEqual(expect.objectContaining({ status: 'ok' }));
    });

    it.skip('should return status error when api or docs are not reachable', async () => {
      jest.spyOn(healthCheckService, 'check').mockResolvedValue({
        status: 'error',
        details: {
          'api-root': { status: 'down' },
          'docs-root': { status: 'down' },
        },
      });
      const result = await controller.liveness();
      expect(result).toEqual(expect.objectContaining({ status: 'error' }));
    });
  });
});

describe('HealthController (HTTP, real Terminus check pipeline)', () => {
  let app: INestApplication;
  const dbIndicator = { pingCheck: jest.fn() };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: HttpHealthIndicator, useValue: {} },
        { provide: TypeOrmHealthIndicator, useValue: dbIndicator },
        { provide: MatrixHealthIndicator, useValue: { isHealthy: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication({ logger: false });
    // Mirror production: GlobalExceptionFilter (APP_FILTER in InterceptorsModule)
    // catches the ServiceUnavailableException, keeps its 503, and rewrites the body.
    app.useGlobalFilters(new GlobalExceptionFilter({ inc: jest.fn() } as any));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should answer 503 when the database ping fails', async () => {
    dbIndicator.pingCheck.mockRejectedValue(
      new HealthCheckError('TypeOrm health check failed', {
        database: { status: 'down' },
      }),
    );

    const res = await request(app.getHttpServer()).get('/health/readiness');

    expect(res.status).toBe(503);
    expect(res.body.statusCode).toBe(503);
    expect(res.body.path).toBe('/health/readiness');
  });

  it('should answer 200 when the database ping succeeds', async () => {
    dbIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });

    const res = await request(app.getHttpServer()).get('/health/readiness');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
