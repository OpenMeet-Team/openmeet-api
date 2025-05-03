import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import {
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { MatrixHealthIndicator } from '../matrix/health/matrix.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn(),
    } as any;

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
          useValue: {},
        },
        {
          provide: MatrixHealthIndicator,
          useValue: {
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
          },
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

    it('should return status error when database is disconnected', async () => {
      const error = new Error('Database connection failed');
      jest.spyOn(healthCheckService, 'check').mockRejectedValue(error);

      const result = await controller.readiness();
      expect(result).toEqual({
        status: 'error',
        database: 'disconnected',
        error: error.message,
      });
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
