import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventSeriesOccurrenceService } from './event-series-occurrence.service';
import { EventSeriesService } from './event-series.service';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { UserService } from '../../user/user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { GroupMemberService } from '../../group-member/group-member.service';

/**
 * updateFutureOccurrences() must enforce the same series-management
 * authorization as update()/delete() (owner, or MANAGE_EVENTS on the series'
 * group). This wires the REAL EventSeriesService into the REAL occurrence
 * service so the shared assertCanManageSeries runs for real; only its
 * collaborators are mocked. A caller who passes authorization proceeds to the
 * template lookup (which we stub to null → NotFoundException, proving the
 * request got past the gate); an unauthorized caller is rejected with 403
 * before any occurrence work happens.
 */
describe('EventSeriesOccurrenceService — updateFutureOccurrences authorization', () => {
  let occurrenceService: EventSeriesOccurrenceService;
  let module: TestingModule;
  let mockGroupMemberService: { findGroupMemberByUserId: jest.Mock };
  let mockEventQueryService: {
    findEventBySlug: jest.Mock;
    findEventsBySeriesSlug: jest.Mock;
  };

  const OWNER_ID = 999;
  const OTHER_ID = 1;
  const GROUP = { id: 168 };

  const memberWith = (perms: string[]) => ({
    groupRole: { groupPermissions: perms.map((name) => ({ name })) },
  });

  beforeEach(async () => {
    mockGroupMemberService = { findGroupMemberByUserId: jest.fn() };
    mockEventQueryService = {
      // template lookup returns null → NotFoundException *after* the auth gate.
      findEventBySlug: jest.fn().mockResolvedValue(null),
      findEventsBySeriesSlug: jest.fn().mockResolvedValue([[]]),
    };

    module = await Test.createTestingModule({
      providers: [
        EventSeriesService,
        EventSeriesOccurrenceService,
        {
          provide: RecurrencePatternService,
          useValue: {
            validateRecurrenceRule: jest.fn(),
            generateOccurrences: jest.fn().mockReturnValue([]),
          },
        },
        { provide: EventManagementService, useValue: { update: jest.fn(), remove: jest.fn() } },
        { provide: EventQueryService, useValue: mockEventQueryService },
        { provide: REQUEST, useValue: { tenantId: 'test-tenant' } },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: () => ({}),
            }),
          },
        },
        { provide: GroupMemberService, useValue: mockGroupMemberService },
        { provide: UserService, useValue: {} },
      ],
    }).compile();

    occurrenceService = await module.resolve<EventSeriesOccurrenceService>(
      EventSeriesOccurrenceService,
    );
    // Spy findBySlug on the exact EventSeriesService instance the occurrence
    // service holds, so the real assertCanManageSeries runs against our series.
    const seriesService = (occurrenceService as any)
      .eventSeriesService as EventSeriesService;
    jest.spyOn(seriesService, 'findBySlug').mockResolvedValue({
      id: 1,
      slug: 'the-series',
      templateEventSlug: 'tmpl',
      user: { id: OWNER_ID },
      group: GROUP,
    } as any);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
  });

  it('authorizes the series owner (proceeds past the gate to the template lookup)', async () => {
    await expect(
      occurrenceService.updateFutureOccurrences('the-series', '2026-01-01', {}, OWNER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockEventQueryService.findEventBySlug).toHaveBeenCalled();
  });

  it('authorizes a non-owner who holds MANAGE_EVENTS on the series group', async () => {
    mockGroupMemberService.findGroupMemberByUserId.mockResolvedValue(
      memberWith(['MANAGE_EVENTS']),
    );
    await expect(
      occurrenceService.updateFutureOccurrences('the-series', '2026-01-01', {}, OTHER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockEventQueryService.findEventBySlug).toHaveBeenCalled();
  });

  it('rejects (403) an unauthorized caller and does no occurrence work', async () => {
    mockGroupMemberService.findGroupMemberByUserId.mockResolvedValue(null);
    const p = occurrenceService.updateFutureOccurrences('the-series', '2026-01-01', {}, OTHER_ID);
    await expect(p).rejects.toBeInstanceOf(ForbiddenException);
    await expect(p.catch((e) => e.getStatus())).resolves.toBe(403);
    // Authorization short-circuits before any template / occurrence work.
    expect(mockEventQueryService.findEventBySlug).not.toHaveBeenCalled();
  });
});
