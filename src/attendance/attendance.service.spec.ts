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
  const testUserUlid = 'user-ulid-123';

  beforeEach(async () => {
    mockEventRepo = {
      findOne: jest.fn(),
    };
    mockContrailQueryService = {
      findByUri: jest.fn(),
      find: jest.fn(),
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
      findByUlid: jest.fn(),
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

    it('should return authorization context fields for tenant events', async () => {
      const mockEvent = {
        id: 4,
        slug: 'group-event',
        visibility: EventVisibility.Public,
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/grp',
        requireApproval: false,
        allowWaitlist: true,
        maxAttendees: 50,
        requireGroupMembership: true,
      };
      mockAtprotoEnrichmentService.parseAtprotoSlug!.mockReturnValue(null);
      mockEventRepo.findOne.mockResolvedValue(mockEvent);

      const result = await service.resolveEvent('group-event');

      expect(result.allowWaitlist).toBe(true);
      expect(result.maxAttendees).toBe(50);
      expect(result.requireGroupMembership).toBe(true);
    });

    it('should default authorization context fields to false/0 for tenant events missing them', async () => {
      const mockEvent = {
        id: 5,
        slug: 'simple-event',
        visibility: EventVisibility.Public,
        atprotoUri: null,
        requireApproval: false,
        // no allowWaitlist, maxAttendees, requireGroupMembership
      };
      mockAtprotoEnrichmentService.parseAtprotoSlug!.mockReturnValue(null);
      mockEventRepo.findOne.mockResolvedValue(mockEvent);

      const result = await service.resolveEvent('simple-event');

      expect(result.allowWaitlist).toBe(false);
      expect(result.maxAttendees).toBe(0);
      expect(result.requireGroupMembership).toBe(false);
    });

    it('should set authorization context to false/0 for foreign events', async () => {
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

      expect(result.allowWaitlist).toBe(false);
      expect(result.maxAttendees).toBe(0);
      expect(result.requireGroupMembership).toBe(false);
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

  describe('recordAttendance', () => {
    it('should publish to PDS only for simple public foreign event', async () => {
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: null,
        uri: 'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockIdentityService.findByUserUlid!.mockResolvedValue({
        did: 'did:plc:user1',
      } as any);
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      });

      const result = await service.recordAttendance(
        'did:plc:foreign~evt1',
        testUserUlid,
        'going',
      );

      expect(mockBlueskyRsvpService.createRsvpByUri).toHaveBeenCalledWith(
        'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        'going',
        'did:plc:user1',
        testTenantId,
      );
      expect(result.rsvpUri).toBe(
        'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      );
      expect(result.attendeeId).toBeNull();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'attendance.changed',
        expect.objectContaining({ status: 'going', previousStatus: null }),
      );
    });

    it('should throw when user has no ATProto identity for public event', async () => {
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: null,
        uri: 'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockIdentityService.findByUserUlid!.mockResolvedValue(null);

      await expect(
        service.recordAttendance('did:plc:foreign~evt1', testUserUlid, 'going'),
      ).rejects.toThrow();
    });

    it('should create local record only for private event', async () => {
      const mockEvent = {
        id: 5,
        slug: 'secret-meetup',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: null,
        isPublic: false,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockUserService.findByUlid!.mockResolvedValue({
        id: 10,
        ulid: testUserUlid,
        slug: 'user-slug',
      } as any);
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 1,
        name: 'Participant',
      } as any);
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 42,
        status: 'confirmed',
      } as any);

      const result = await service.recordAttendance(
        'secret-meetup',
        testUserUlid,
        'going',
      );

      expect(mockEventAttendeeService.create).toHaveBeenCalled();
      expect(mockBlueskyRsvpService.createRsvpByUri).not.toHaveBeenCalled();
      expect(result.attendeeId).toBe(42);
      expect(result.rsvpUri).toBeNull();
    });

    it('should create local record AND publish to PDS for approval-required public event', async () => {
      const mockEvent = {
        id: 7,
        slug: 'gated-event',
        visibility: EventVisibility.Public,
        atprotoUri: 'at://did:plc:me/community.lexicon.calendar.event/gated',
        requireApproval: true,
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: mockEvent.atprotoUri,
        isPublic: true,
        requiresApproval: true,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockIdentityService.findByUserUlid!.mockResolvedValue({
        did: 'did:plc:user1',
      } as any);
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/xyz',
      });
      mockUserService.findByUlid!.mockResolvedValue({
        id: 10,
        ulid: testUserUlid,
        slug: 'user-slug',
      } as any);
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 1,
        name: 'Participant',
      } as any);
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 55,
        status: 'pending',
      } as any);

      const result = await service.recordAttendance(
        'gated-event',
        testUserUlid,
        'going',
      );

      expect(mockBlueskyRsvpService.createRsvpByUri).toHaveBeenCalled();
      expect(mockEventAttendeeService.create).toHaveBeenCalled();
      expect(result.attendeeId).toBe(55);
      expect(result.rsvpUri).toBe(
        'at://did:plc:user1/community.lexicon.calendar.rsvp/xyz',
      );
    });
  });

  describe('cancelAttendance', () => {
    it('should publish notgoing to PDS for public foreign event', async () => {
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: null,
        uri: 'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockIdentityService.findByUserUlid!.mockResolvedValue({
        did: 'did:plc:user1',
      } as any);
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      });

      const result = await service.cancelAttendance(
        'did:plc:foreign~evt1',
        testUserUlid,
      );

      expect(mockBlueskyRsvpService.createRsvpByUri).toHaveBeenCalledWith(
        'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        'notgoing',
        'did:plc:user1',
        testTenantId,
      );
      expect(result.status).toBe('notgoing');
    });

    it('should update local record for private event cancellation', async () => {
      const mockEvent = { id: 5, slug: 'secret-meetup' };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: null,
        isPublic: false,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockUserService.findByUlid!.mockResolvedValue({
        slug: 'user-slug',
      } as any);
      mockEventAttendeeService.cancelEventAttendanceBySlug!.mockResolvedValue({
        id: 42,
        status: 'cancelled',
      } as any);

      const result = await service.cancelAttendance(
        'secret-meetup',
        testUserUlid,
      );

      expect(
        mockEventAttendeeService.cancelEventAttendanceBySlug,
      ).toHaveBeenCalledWith('secret-meetup', 'user-slug');
      expect(mockBlueskyRsvpService.createRsvpByUri).not.toHaveBeenCalled();
      expect(result.attendeeId).toBe(42);
    });

    it('should emit attendance.changed on cancellation', async () => {
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: null,
        uri: 'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockIdentityService.findByUserUlid!.mockResolvedValue({
        did: 'did:plc:user1',
      } as any);
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      });

      await service.cancelAttendance('did:plc:foreign~evt1', testUserUlid);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'attendance.changed',
        expect.objectContaining({
          status: 'notgoing',
          previousStatus: 'going',
        }),
      );
    });
  });

  describe('isAttending', () => {
    it('should find attending status from Contrail RSVP records', async () => {
      mockContrailQueryService.find!.mockResolvedValue({
        records: [
          {
            uri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
            record: {
              status: 'community.lexicon.calendar.rsvp#going',
            },
          },
        ],
        total: 1,
      });

      const result = await service.isAttending(
        'at://did:plc:creator/community.lexicon.calendar.event/evt1',
        'did:plc:user1',
      );

      expect(result).toEqual({ attending: true, status: 'going' });
    });

    it('should return not attending when no RSVP in Contrail', async () => {
      mockContrailQueryService.find!.mockResolvedValue({
        records: [],
        total: 0,
      });

      const result = await service.isAttending(
        'at://did:plc:creator/community.lexicon.calendar.event/evt1',
        'did:plc:user1',
      );

      expect(result).toEqual({ attending: false, status: null });
    });

    it('should return not attending for notgoing status', async () => {
      mockContrailQueryService.find!.mockResolvedValue({
        records: [
          {
            uri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
            record: {
              status: 'community.lexicon.calendar.rsvp#notgoing',
            },
          },
        ],
        total: 1,
      });

      const result = await service.isAttending(
        'at://did:plc:creator/community.lexicon.calendar.event/evt1',
        'did:plc:user1',
      );

      expect(result).toEqual({ attending: false, status: 'notgoing' });
    });

    it('should return attending for interested status', async () => {
      mockContrailQueryService.find!.mockResolvedValue({
        records: [
          {
            uri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
            record: {
              status: 'community.lexicon.calendar.rsvp#interested',
            },
          },
        ],
        total: 1,
      });

      const result = await service.isAttending(
        'at://did:plc:creator/community.lexicon.calendar.event/evt1',
        'did:plc:user1',
      );

      expect(result).toEqual({ attending: true, status: 'interested' });
    });

    it('should pass correct conditions to contrailQueryService.find', async () => {
      mockContrailQueryService.find!.mockResolvedValue({
        records: [],
        total: 0,
      });

      const eventUri =
        'at://did:plc:creator/community.lexicon.calendar.event/evt1';
      const userDid = 'did:plc:user1';

      await service.isAttending(eventUri, userDid);

      expect(mockContrailQueryService.find).toHaveBeenCalledWith(
        'community.lexicon.calendar.rsvp',
        {
          conditions: [
            {
              sql: "record->'subject'->>'uri' = $1",
              params: [eventUri],
            },
            { sql: 'did = $1', params: [userDid] },
          ],
          limit: 1,
        },
      );
    });
  });
});
