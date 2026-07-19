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
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';

/**
 * Authorization for modifying an existing event series.
 *
 * Modifying a series (update / delete) requires either:
 *   - being the series owner (series.user.id), or
 *   - holding MANAGE_EVENTS on the series' group (the same group permission
 *     that governs event management).
 *
 * A standalone series (no group) stays owner-only. Non-owner, non-permitted
 * callers get 403 Forbidden — never 401 (a 401 made the web client's axios
 * interceptor treat it as an expired session and replay the request forever,
 * a ~5 req/s self-DoS). Exercises the REAL service (event-series.service.spec.ts
 * auto-mocks it).
 */
describe('EventSeriesService — ownership guards', () => {
  let service: EventSeriesService;
  let module: TestingModule;
  let mockRepo: any;
  let mockGroupMemberService: { findGroupMemberByUserId: jest.Mock };

  const OWNER_ID = 999;
  const OTHER_ID = 1;
  const GROUP = { id: 168, slug: 'the-group' };

  const memberWith = (perms: string[]) => ({
    groupRole: { groupPermissions: perms.map((name) => ({ name })) },
  });

  const stubSeries = (opts: { withGroup: boolean }) =>
    jest.spyOn(service, 'findBySlug').mockResolvedValue({
      id: 1,
      slug: 'the-series',
      name: 'The Series',
      user: { id: OWNER_ID },
      group: opts.withGroup ? GROUP : null,
    } as any);

  beforeEach(async () => {
    mockRepo = {
      save: jest.fn().mockResolvedValue({ id: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    mockGroupMemberService = { findGroupMemberByUserId: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        EventSeriesService,
        {
          provide: RecurrencePatternService,
          useValue: { validateRecurrenceRule: jest.fn().mockReturnValue(true) },
        },
        { provide: EventManagementService, useValue: { update: jest.fn(), remove: jest.fn() } },
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
        { provide: GroupMemberService, useValue: mockGroupMemberService },
        { provide: getRepositoryToken(EventSeriesEntity), useValue: mockRepo },
        { provide: DataSource, useValue: { getRepository: () => mockRepo } },
      ],
    }).compile();

    service = await module.resolve<EventSeriesService>(EventSeriesService);
    // findBySlug is stubbed per-test, so the lazy repo never initializes; set it
    // directly so the allowed paths (save/delete) have a repository to call.
    (service as any).eventSeriesRepository = mockRepo;
    // update() re-fetches via findById after save.
    jest.spyOn(service, 'findById').mockResolvedValue({ id: 1, slug: 'the-series' } as any);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
  });

  describe('update()', () => {
    it('allows the series owner (no group lookup needed)', async () => {
      stubSeries({ withGroup: true });
      await expect(
        service.update('the-series', {} as any, OWNER_ID, 'test-tenant'),
      ).resolves.toBeDefined();
      expect(mockGroupMemberService.findGroupMemberByUserId).not.toHaveBeenCalled();
    });

    it('allows a non-owner who holds MANAGE_EVENTS on the series group', async () => {
      stubSeries({ withGroup: true });
      mockGroupMemberService.findGroupMemberByUserId.mockResolvedValue(
        memberWith(['MANAGE_EVENTS']),
      );
      await expect(
        service.update('the-series', {} as any, OTHER_ID, 'test-tenant'),
      ).resolves.toBeDefined();
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('rejects (403) a group member lacking MANAGE_EVENTS', async () => {
      stubSeries({ withGroup: true });
      mockGroupMemberService.findGroupMemberByUserId.mockResolvedValue(
        memberWith(['MESSAGE_MEMBERS']),
      );
      const p = service.update('the-series', {} as any, OTHER_ID, 'test-tenant');
      await expect(p).rejects.toBeInstanceOf(ForbiddenException);
      await expect(p.catch((e) => e.getStatus())).resolves.toBe(403);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('rejects (403) a non-owner who is not a group member', async () => {
      stubSeries({ withGroup: true });
      mockGroupMemberService.findGroupMemberByUserId.mockResolvedValue(null);
      await expect(
        service.update('the-series', {} as any, OTHER_ID, 'test-tenant'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('rejects (403) a non-owner on a standalone (group-less) series without checking group perms', async () => {
      stubSeries({ withGroup: false });
      await expect(
        service.update('the-series', {} as any, OTHER_ID, 'test-tenant'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockGroupMemberService.findGroupMemberByUserId).not.toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('allows a non-owner who holds MANAGE_EVENTS on the series group', async () => {
      stubSeries({ withGroup: true });
      mockGroupMemberService.findGroupMemberByUserId.mockResolvedValue(
        memberWith(['MANAGE_EVENTS']),
      );
      await expect(
        service.delete('the-series', OTHER_ID, false, 'test-tenant'),
      ).resolves.toBeUndefined();
      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });

    it('rejects (403) a non-owner who is not a group member', async () => {
      stubSeries({ withGroup: true });
      mockGroupMemberService.findGroupMemberByUserId.mockResolvedValue(null);
      const p = service.delete('the-series', OTHER_ID, false, 'test-tenant');
      await expect(p).rejects.toBeInstanceOf(ForbiddenException);
      await expect(p.catch((e) => e.getStatus())).resolves.toBe(403);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('rejects (403) a non-owner on a standalone (group-less) series', async () => {
      stubSeries({ withGroup: false });
      await expect(
        service.delete('the-series', OTHER_ID, false, 'test-tenant'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockGroupMemberService.findGroupMemberByUserId).not.toHaveBeenCalled();
    });
  });
});
