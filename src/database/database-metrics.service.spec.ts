import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseMetricsService } from './database-metrics.service';
import { Histogram, Counter } from 'prom-client';

describe('DatabaseMetricsService', () => {
  let service: DatabaseMetricsService;
  let mockQueryDurationHistogram: jest.Mocked<Histogram<string>>;
  let mockQueriesCounter: jest.Mocked<Counter<string>>;

  beforeEach(async () => {
    mockQueryDurationHistogram = {
      observe: jest.fn(),
    } as any;

    mockQueriesCounter = {
      inc: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseMetricsService,
        {
          provide: 'PROM_METRIC_DB_POOL_SIZE',
          useValue: { set: jest.fn() },
        },
        {
          provide: 'PROM_METRIC_DB_POOL_IDLE',
          useValue: { set: jest.fn() },
        },
        {
          provide: 'PROM_METRIC_DB_POOL_WAITING',
          useValue: { set: jest.fn() },
        },
        {
          provide: 'PROM_METRIC_DB_ACTIVE_CONNECTIONS',
          useValue: { set: jest.fn() },
        },
        {
          provide: 'PROM_METRIC_DB_QUERY_DURATION_SECONDS',
          useValue: mockQueryDurationHistogram,
        },
        {
          provide: 'PROM_METRIC_DB_CONNECTION_ERRORS_TOTAL',
          useValue: { inc: jest.fn() },
        },
        {
          provide: 'PROM_METRIC_DB_QUERIES_TOTAL',
          useValue: mockQueriesCounter,
        },
        {
          provide: 'PROM_METRIC_DB_CONNECTION_ACQUISITION_DURATION_SECONDS',
          useValue: { observe: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DatabaseMetricsService>(DatabaseMetricsService);
  });

  describe('recordQueryDuration', () => {
    it('should pass fingerprint label to histogram observe', () => {
      service.recordQueryDuration(
        'tenant1',
        'SELECT',
        50,
        'success',
        'abc123def456',
      );

      expect(mockQueryDurationHistogram.observe).toHaveBeenCalledWith(
        {
          tenant: 'tenant1',
          operation: 'SELECT',
          status: 'success',
          fingerprint: 'abc123def456',
        },
        0.05,
      );
    });

    it('should default fingerprint to "unknown" when not provided', () => {
      service.recordQueryDuration('tenant1', 'INSERT', 100, 'success');

      expect(mockQueryDurationHistogram.observe).toHaveBeenCalledWith(
        {
          tenant: 'tenant1',
          operation: 'INSERT',
          status: 'success',
          fingerprint: 'unknown',
        },
        0.1,
      );
    });

    it('should include fingerprint in slow query warning log', () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      service.recordQueryDuration(
        'tenant1',
        'SELECT',
        1500,
        'success',
        'slowquery1234',
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('slowquery1234'),
      );
    });

    it('should pass fingerprint with error status', () => {
      service.recordQueryDuration(
        'tenant1',
        'UPDATE',
        200,
        'error',
        'errfp123456',
      );

      expect(mockQueryDurationHistogram.observe).toHaveBeenCalledWith(
        {
          tenant: 'tenant1',
          operation: 'UPDATE',
          status: 'error',
          fingerprint: 'errfp123456',
        },
        0.2,
      );
    });
  });
});
