import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventSeriesService } from './event-series.service';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';

/**
 * Regression guard: a non-owner update/delete must return 403 ForbiddenException
 * (authenticated but not permitted), NOT 401. A 401 made the frontend axios
 * interceptor treat it as an expired session, refresh the token, and replay the
 * request forever (~5 req/s self-DoS). This exercises the REAL service (no
 * jest.mock of the service under test, unlike event-series.service.spec.ts).
 */
describe('EventSeriesService — ownership guards', () => {
  let service: EventSeriesService;
  let module: TestingModule;
  let mockRepo: any;

  const seriesOwnedByAnotherUser = {
    id: 1,
    slug: 'someone-elses-series',
    name: 'Someone Else\'s Series',
    user: { id: 999 },
  };

  beforeEach(async () => {
    mockRepo = { save: jest.fn(), delete: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        EventSeriesService,
        {
          provide: RecurrencePatternService,
          useValue: { validateRecurrenceRule: jest.fn().mockReturnValue(true) },
        },
        { provide: EventManagementService, useValue: { remove: jest.fn() } },
        {
          provide: EventQueryService,
          useValue: { findEventsBySeriesSlug: jest.fn().mockResolvedValue([[]]) },
        },
        { provide: REQUEST, useValue: { tenantId: 'test-tenant' } },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: () => mockRepo,
            }),
          },
        },
        { provide: getRepositoryToken(EventSeriesEntity), useValue: mockRepo },
        { provide: DataSource, useValue: { getRepository: () => mockRepo } },
      ],
    }).compile();

    service = await module.resolve<EventSeriesService>(EventSeriesService);
    // The ownership check runs right after findBySlug; stub it so we exercise
    // the guard, not the lookup.
    jest
      .spyOn(service, 'findBySlug')
      .mockResolvedValue(seriesOwnedByAnotherUser as any);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
  });

  it('update() throws ForbiddenException (403) for a non-owner and does not persist', async () => {
    // caller userId 1 != owner userId 999
    const promise = service.update('someone-elses-series', {} as any, 1, 'test-tenant');
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise.catch((e) => e.getStatus())).resolves.toBe(403);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('delete() throws ForbiddenException (403) for a non-owner and does not delete', async () => {
    const promise = service.delete('someone-elses-series', 1, false, 'test-tenant');
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise.catch((e) => e.getStatus())).resolves.toBe(403);
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });
});
