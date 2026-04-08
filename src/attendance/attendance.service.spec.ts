import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from './attendance.service';
import { EventVisibility } from '../core/constants/constant';
import { REQUEST } from '@nestjs/core';
import { ContrailQueryService } from '../contrail/contrail-query.service';
import { AtprotoEnrichmentService } from '../atproto-enrichment/atproto-enrichment.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { UserService } from '../user/user.service';
import { EventRoleService } from '../event-role/event-role.service';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let mockContrailQueryService: jest.Mocked<Partial<ContrailQueryService>>;
  let mockAtprotoEnrichmentService: jest.Mocked<
    Partial<AtprotoEnrichmentService>
  >;
  let mockBlueskyRsvpService: jest.Mocked<Partial<BlueskyRsvpService>>;
  let mockIdentityService: jest.Mocked<Partial<UserAtprotoIdentityService>>;
  let mockEventEmitter: jest.Mocked<Partial<EventEmitter2>>;
  let mockEventAttendeeService: jest.Mocked<Partial<EventAttendeeService>>;
  let mockUserService: jest.Mocked<Partial<UserService>>;
  let mockEventRoleService: jest.Mocked<Partial<EventRoleService>>;
  let mockTenantConnectionService: any;
  let mockEventRepo: any;

  const testTenantId = 'test-tenant';

  beforeEach(async () => {
    mockEventRepo = {
      findOne: jest.fn(),
    };
    mockContrailQueryService = {
      findByUri: jest.fn(),
    };
    mockAtprotoEnrichmentService = {
      parseAtprotoSlug: jest.fn(),
    };
    mockBlueskyRsvpService = {
      createRsvpByUri: jest.fn(),
    };
    mockIdentityService = {
      findByUserUlid: jest.fn(),
    };
    mockEventEmitter = {
      emit: jest.fn(),
    };
    mockEventAttendeeService = {
      create: jest.fn(),
      cancelEventAttendanceBySlug: jest.fn(),
      findEventAttendeeByUserId: jest.fn(),
      reactivateEventAttendanceBySlug: jest.fn(),
    };
    mockUserService = {
      getUserByUlid: jest.fn(),
    };
    mockEventRoleService = {
      getRoleByName: jest.fn(),
    };
    mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockEventRepo),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: ContrailQueryService, useValue: mockContrailQueryService },
        {
          provide: AtprotoEnrichmentService,
          useValue: mockAtprotoEnrichmentService,
        },
        { provide: BlueskyRsvpService, useValue: mockBlueskyRsvpService },
        {
          provide: UserAtprotoIdentityService,
          useValue: mockIdentityService,
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        { provide: UserService, useValue: mockUserService },
        { provide: EventRoleService, useValue: mockEventRoleService },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        { provide: REQUEST, useValue: { tenantId: testTenantId } },
      ],
    }).compile();

    service = await module.resolve<AttendanceService>(AttendanceService);
  });

  describe('resolveEvent', () => {
    it('should resolve a tenant slug to a local public event', async () => {
      const mockEvent = {
        id: 1,
        slug: 'my-event-abc123',
        visibility: EventVisibility.Public,
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/123',
        requireApproval: false,
      };
      mockAtprotoEnrichmentService.parseAtprotoSlug!.mockReturnValue(null);
      mockEventRepo.findOne.mockResolvedValue(mockEvent);

      const result = await service.resolveEvent('my-event-abc123');

      expect(result.tenantEvent).toBe(mockEvent);
      expect(result.uri).toBe(mockEvent.atprotoUri);
      expect(result.isPublic).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    it('should resolve a did~rkey slug to a foreign event via Contrail', async () => {
      mockAtprotoEnrichmentService.parseAtprotoSlug!.mockReturnValue({
        did: 'did:plc:foreign123',
        rkey: 'evt456',
      });
      mockContrailQueryService.findByUri!.mockResolvedValue({
        uri: 'at://did:plc:foreign123/community.lexicon.calendar.event/evt456',
        did: 'did:plc:foreign123',
        rkey: 'evt456',
        cid: 'bafyabc',
        record: { name: 'Foreign Event' },
        time_us: 0,
        indexed_at: new Date(),
      } as any);

      const result = await service.resolveEvent('did:plc:foreign123~evt456');

      expect(result.tenantEvent).toBeNull();
      expect(result.uri).toBe(
        'at://did:plc:foreign123/community.lexicon.calendar.event/evt456',
      );
      expect(result.isPublic).toBe(true);
    });

    it('should throw NotFoundException for unknown tenant slug', async () => {
      mockAtprotoEnrichmentService.parseAtprotoSlug!.mockReturnValue(null);
      mockEventRepo.findOne.mockResolvedValue(null);

      await expect(service.resolveEvent('nonexistent')).rejects.toThrow();
    });

    it('should throw NotFoundException for did~rkey not in Contrail', async () => {
      mockAtprotoEnrichmentService.parseAtprotoSlug!.mockReturnValue({
        did: 'did:plc:gone',
        rkey: 'missing',
      });
      mockContrailQueryService.findByUri!.mockResolvedValue(null);

      await expect(
        service.resolveEvent('did:plc:gone~missing'),
      ).rejects.toThrow();
    });

    it('should resolve a private tenant event as not public', async () => {
      const mockEvent = {
        id: 2,
        slug: 'private-event-xyz',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
      };
      mockAtprotoEnrichmentService.parseAtprotoSlug!.mockReturnValue(null);
      mockEventRepo.findOne.mockResolvedValue(mockEvent);

      const result = await service.resolveEvent('private-event-xyz');

      expect(result.isPublic).toBe(false);
      expect(result.uri).toBeNull();
    });

    it('should flag approval-required events', async () => {
      const mockEvent = {
        id: 3,
        slug: 'gated-event',
        visibility: EventVisibility.Public,
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/gated',
        requireApproval: true,
      };
      mockAtprotoEnrichmentService.parseAtprotoSlug!.mockReturnValue(null);
      mockEventRepo.findOne.mockResolvedValue(mockEvent);

      const result = await service.resolveEvent('gated-event');

      expect(result.isPublic).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });
  });
});
