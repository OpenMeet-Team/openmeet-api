import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
  EventVisibility,
} from '../core/constants/constant';
import { REQUEST } from '@nestjs/core';
import { ContrailQueryService } from '../contrail/contrail-query.service';
import { AtprotoEnrichmentService } from '../atproto-enrichment/atproto-enrichment.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { UserService } from '../user/user.service';
import { EventRoleService } from '../event-role/event-role.service';
import { GroupMemberQueryService } from '../group-member/group-member-query.service';
import { PdsSessionService } from '../pds/pds-session.service';
import { SessionUnavailableError } from '../pds/pds.errors';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let mockContrailQueryService: jest.Mocked<Partial<ContrailQueryService>>;
  let mockAtprotoEnrichmentService: jest.Mocked<
    Partial<AtprotoEnrichmentService>
  >;
  let mockBlueskyRsvpService: jest.Mocked<Partial<BlueskyRsvpService>>;
  let mockEventEmitter: jest.Mocked<Partial<EventEmitter2>>;
  let mockEventAttendeeService: jest.Mocked<Partial<EventAttendeeService>>;
  let mockUserService: jest.Mocked<Partial<UserService>>;
  let mockEventRoleService: jest.Mocked<Partial<EventRoleService>>;
  let mockGroupMemberQueryService: jest.Mocked<
    Partial<GroupMemberQueryService>
  >;
  let mockPdsSessionService: jest.Mocked<Partial<PdsSessionService>>;
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
    mockEventEmitter = {
      emit: jest.fn(),
    };
    mockEventAttendeeService = {
      create: jest.fn(),
      save: jest.fn(),
      cancelEventAttendanceBySlug: jest.fn(),
      findEventAttendeeByUserId: jest.fn(),
      findEventAttendeeByUserSlug: jest.fn(),
      reactivateEventAttendanceBySlug: jest.fn(),
      showEventAttendeesCount: jest.fn(),
    };
    mockUserService = {
      findByUlid: jest.fn(),
    };
    mockEventRoleService = {
      getRoleByName: jest.fn(),
    };
    mockGroupMemberQueryService = {
      findGroupMemberByUserId: jest.fn(),
    };
    mockPdsSessionService = {
      getSessionForUser: jest.fn(),
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
        { provide: EventEmitter2, useValue: mockEventEmitter },
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        { provide: UserService, useValue: mockUserService },
        { provide: EventRoleService, useValue: mockEventRoleService },
        {
          provide: GroupMemberQueryService,
          useValue: mockGroupMemberQueryService,
        },
        {
          provide: PdsSessionService,
          useValue: mockPdsSessionService,
        },
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
      const mockAgent = { did: 'did:plc:user1' } as any;
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: null,
        uri: 'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        isPublic: true,
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
      mockPdsSessionService.getSessionForUser!.mockResolvedValue({
        did: 'did:plc:user1',
        agent: mockAgent,
        isCustodial: true,
        source: 'fresh',
      });
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      });

      const result = await service.recordAttendance(
        'did:plc:foreign~evt1',
        testUserUlid,
        'going',
      );

      expect(mockPdsSessionService.getSessionForUser).toHaveBeenCalledWith(
        testTenantId,
        testUserUlid,
      );
      expect(mockBlueskyRsvpService.createRsvpByUri).toHaveBeenCalledWith(
        'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        'going',
        'did:plc:user1',
        testTenantId,
        mockAgent,
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
      mockUserService.findByUlid!.mockResolvedValue({
        id: 10,
        ulid: testUserUlid,
        slug: 'user-slug',
      } as any);
      mockPdsSessionService.getSessionForUser!.mockResolvedValue(null);

      await expect(
        service.recordAttendance('did:plc:foreign~evt1', testUserUlid, 'going'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when SessionUnavailableError occurs', async () => {
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: null,
        uri: 'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        isPublic: true,
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
      mockPdsSessionService.getSessionForUser!.mockRejectedValue(
        new SessionUnavailableError('Session expired', true, 'did:plc:user1'),
      );

      await expect(
        service.recordAttendance('did:plc:foreign~evt1', testUserUlid, 'going'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create local record only for private event', async () => {
      const mockEvent = {
        id: 5,
        slug: 'secret-meetup',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        user: { id: 10 },
        group: null,
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
      const mockAgent = { did: 'did:plc:user1' } as any;
      mockPdsSessionService.getSessionForUser!.mockResolvedValue({
        did: 'did:plc:user1',
        agent: mockAgent,
        isCustodial: true,
        source: 'fresh',
      });
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
      const mockAgent = { did: 'did:plc:user1' } as any;
      mockPdsSessionService.getSessionForUser!.mockResolvedValue({
        did: 'did:plc:user1',
        agent: mockAgent,
        isCustodial: true,
        source: 'fresh',
      });
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      });

      const result = await service.cancelAttendance(
        'did:plc:foreign~evt1',
        testUserUlid,
      );

      expect(mockPdsSessionService.getSessionForUser).toHaveBeenCalledWith(
        testTenantId,
        testUserUlid,
      );
      expect(mockBlueskyRsvpService.createRsvpByUri).toHaveBeenCalledWith(
        'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        'notgoing',
        'did:plc:user1',
        testTenantId,
        mockAgent,
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

    it('should emit previousStatus as the status BEFORE cancellation for private events', async () => {
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
      // The attendee was confirmed BEFORE cancellation
      mockEventAttendeeService.findEventAttendeeByUserSlug!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Confirmed,
      } as any);
      // After cancellation, the returned attendee has status Cancelled
      mockEventAttendeeService.cancelEventAttendanceBySlug!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Cancelled,
      } as any);

      await service.cancelAttendance('secret-meetup', testUserUlid);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'attendance.changed',
        expect.objectContaining({
          status: 'notgoing',
          previousStatus: EventAttendeeStatus.Confirmed,
        }),
      );
    });

    it('should emit attendance.changed on cancellation of foreign event with null previousStatus', async () => {
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: null,
        uri: 'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      const mockAgent = { did: 'did:plc:user1' } as any;
      mockPdsSessionService.getSessionForUser!.mockResolvedValue({
        did: 'did:plc:user1',
        agent: mockAgent,
        isCustodial: true,
        source: 'fresh',
      });
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      });

      await service.cancelAttendance('did:plc:foreign~evt1', testUserUlid);

      // Foreign events have no local record, so previousStatus is null
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'attendance.changed',
        expect.objectContaining({
          status: 'notgoing',
          previousStatus: null,
        }),
      );
    });

    it('should emit actual previousStatus when cancelling public tenant event', async () => {
      const mockEvent = { id: 5, slug: 'public-meetup' };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: 'at://did:plc:host/community.lexicon.calendar.event/evt1',
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      const mockAgent = { did: 'did:plc:user1' } as any;
      mockPdsSessionService.getSessionForUser!.mockResolvedValue({
        did: 'did:plc:user1',
        agent: mockAgent,
        isCustodial: true,
        source: 'fresh',
      });
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      });
      mockUserService.findByUlid!.mockResolvedValue({
        slug: 'user-slug',
      } as any);
      // The attendee was on waitlist before cancellation
      mockEventAttendeeService.findEventAttendeeByUserSlug!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Waitlist,
      } as any);
      mockEventAttendeeService.cancelEventAttendanceBySlug!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Cancelled,
      } as any);

      await service.cancelAttendance('public-meetup', testUserUlid);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'attendance.changed',
        expect.objectContaining({
          status: 'notgoing',
          previousStatus: EventAttendeeStatus.Waitlist,
        }),
      );
    });

    it('should gracefully handle PDS failure during cancel for public tenant event without atprotoUri', async () => {
      const mockEvent = { id: 5, slug: 'new-event' };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: null,
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockUserService.findByUlid!.mockResolvedValue({
        slug: 'user-slug',
      } as any);
      mockEventAttendeeService.findEventAttendeeByUserSlug!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Confirmed,
      } as any);
      mockEventAttendeeService.cancelEventAttendanceBySlug!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Cancelled,
      } as any);

      // Should NOT crash — PDS call is skipped when uri is null
      const result = await service.cancelAttendance('new-event', testUserUlid);

      expect(mockBlueskyRsvpService.createRsvpByUri).not.toHaveBeenCalled();
      expect(result.attendeeId).toBe(42);
      expect(result.status).toBe('notgoing');
    });
  });

  describe('authorization', () => {
    const mockUser = { id: 10, ulid: 'user-ulid-123', slug: 'user-slug' };

    it('should allow creator to RSVP to own private event', async () => {
      const mockEvent = {
        id: 5,
        slug: 'private-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        user: { id: 10 },
        group: null,
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
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 1,
        name: 'Participant',
      } as any);
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 42,
        status: 'confirmed',
      } as any);

      const result = await service.recordAttendance(
        'private-event',
        testUserUlid,
        'going',
      );

      expect(result.attendeeId).toBe(42);
    });

    it('should deny non-member from private group event', async () => {
      const mockEvent = {
        id: 5,
        slug: 'private-group-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        user: { id: 999 },
        group: { id: 1, slug: 'my-group' },
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
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );
      mockGroupMemberQueryService.findGroupMemberByUserId!.mockResolvedValue(
        null,
      );

      await expect(
        service.recordAttendance('private-group-event', testUserUlid, 'going'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow group member to RSVP to private group event', async () => {
      const mockEvent = {
        id: 5,
        slug: 'private-group-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        user: { id: 999 },
        group: { id: 1, slug: 'my-group' },
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
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );
      mockGroupMemberQueryService.findGroupMemberByUserId!.mockResolvedValue({
        id: 1,
        groupRole: { name: 'member' },
      } as any);
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 1,
        name: 'Participant',
      } as any);
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 55,
        status: 'confirmed',
      } as any);

      const result = await service.recordAttendance(
        'private-group-event',
        testUserUlid,
        'going',
      );

      expect(result.attendeeId).toBe(55);
    });

    it('should deny non-member from private non-group event', async () => {
      const mockEvent = {
        id: 5,
        slug: 'private-invite-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        user: { id: 999 },
        group: null,
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
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );

      await expect(
        service.recordAttendance('private-invite-event', testUserUlid, 'going'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny guest role from group-restricted event', async () => {
      const mockEvent = {
        id: 6,
        slug: 'group-restricted',
        visibility: EventVisibility.Public,
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/grp',
        requireApproval: false,
        user: { id: 999 },
        group: { id: 1, slug: 'my-group' },
        requireGroupMembership: true,
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: mockEvent.atprotoUri,
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: true,
      });
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
      mockGroupMemberQueryService.findGroupMemberByUserId!.mockResolvedValue({
        id: 1,
        groupRole: { name: 'guest' },
      } as any);

      await expect(
        service.recordAttendance('group-restricted', testUserUlid, 'going'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should deny non-group-member from requireGroupMembership event', async () => {
      const mockEvent = {
        id: 6,
        slug: 'group-restricted',
        visibility: EventVisibility.Public,
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/grp',
        requireApproval: false,
        user: { id: 999 },
        group: { id: 1, slug: 'my-group' },
        requireGroupMembership: true,
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: mockEvent.atprotoUri,
        isPublic: true,
        requiresApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: true,
      });
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
      mockGroupMemberQueryService.findGroupMemberByUserId!.mockResolvedValue(
        null,
      );

      await expect(
        service.recordAttendance('group-restricted', testUserUlid, 'going'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip authorization entirely for foreign events', async () => {
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: null,
        uri: 'at://did:plc:foreign/community.lexicon.calendar.event/evt1',
        isPublic: true,
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
      const mockAgent = { did: 'did:plc:user1' } as any;
      mockPdsSessionService.getSessionForUser!.mockResolvedValue({
        did: 'did:plc:user1',
        agent: mockAgent,
        isCustodial: true,
        source: 'fresh',
      });
      mockBlueskyRsvpService.createRsvpByUri!.mockResolvedValue({
        success: true,
        rsvpUri: 'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      });

      const result = await service.recordAttendance(
        'did:plc:foreign~evt1',
        testUserUlid,
        'going',
      );

      expect(result.rsvpUri).toBe(
        'at://did:plc:user1/community.lexicon.calendar.rsvp/abc',
      );
      expect(
        mockGroupMemberQueryService.findGroupMemberByUserId,
      ).not.toHaveBeenCalled();
    });
  });

  describe('upsert behavior', () => {
    const mockUser = { id: 10, ulid: 'user-ulid-123', slug: 'user-slug' };
    const mockEvent = {
      id: 5,
      slug: 'upsert-event',
      visibility: EventVisibility.Private,
      atprotoUri: null,
      requireApproval: false,
      user: { id: 10 }, // same as mockUser.id — creator can always attend
      group: null,
    };

    const makeResolved = (overrides = {}) => ({
      tenantEvent: mockEvent as any,
      uri: null,
      isPublic: false,
      requiresApproval: false,
      allowWaitlist: false,
      maxAttendees: 0,
      requireGroupMembership: false,
      ...overrides,
    });

    beforeEach(() => {
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 1,
        name: EventAttendeeRole.Participant,
      } as any);
    });

    it('should return existing active attendee without writing (idempotent)', async () => {
      const existing = {
        id: 42,
        status: EventAttendeeStatus.Confirmed,
        role: { id: 1, name: EventAttendeeRole.Participant },
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue(makeResolved());
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        existing as any,
      );

      const result = await service.recordAttendance(
        'upsert-event',
        testUserUlid,
        'going',
      );

      expect(mockEventAttendeeService.create).not.toHaveBeenCalled();
      expect(mockEventAttendeeService.save).not.toHaveBeenCalled();
      expect(result.attendeeId).toBe(42);
    });

    it('should NOT emit attendance.changed on no-op re-RSVP (same status)', async () => {
      const existing = {
        id: 42,
        status: EventAttendeeStatus.Confirmed,
        role: { id: 1, name: EventAttendeeRole.Participant },
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue(makeResolved());
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        existing as any,
      );

      await service.recordAttendance('upsert-event', testUserUlid, 'going');

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reactivate cancelled attendee via save (not create)', async () => {
      const existing = {
        id: 42,
        status: EventAttendeeStatus.Cancelled,
        role: { id: 1, name: EventAttendeeRole.Participant },
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue(makeResolved());
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        existing as any,
      );
      mockEventAttendeeService.save!.mockResolvedValue({
        ...existing,
        status: EventAttendeeStatus.Confirmed,
      } as any);

      const result = await service.recordAttendance(
        'upsert-event',
        testUserUlid,
        'going',
      );

      expect(mockEventAttendeeService.save).toHaveBeenCalled();
      expect(mockEventAttendeeService.create).not.toHaveBeenCalled();
      expect(result.attendeeId).toBe(42);
    });

    it('should create new attendee when none exists', async () => {
      jest.spyOn(service, 'resolveEvent').mockResolvedValue(makeResolved());
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 99,
        status: EventAttendeeStatus.Confirmed,
      } as any);

      const result = await service.recordAttendance(
        'upsert-event',
        testUserUlid,
        'going',
      );

      expect(mockEventAttendeeService.create).toHaveBeenCalled();
      expect(result.attendeeId).toBe(99);
    });
  });

  describe('waitlist and approval', () => {
    const mockUser = { id: 10, ulid: 'user-ulid-123', slug: 'user-slug' };

    beforeEach(() => {
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 1,
        name: EventAttendeeRole.Participant,
      } as any);
    });

    it('should set Waitlist status when event at capacity', async () => {
      const mockEvent = {
        id: 5,
        slug: 'full-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        allowWaitlist: true,
        maxAttendees: 10,
        user: { id: 10 }, // creator can always attend
        group: null,
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: null,
        isPublic: false,
        requiresApproval: false,
        allowWaitlist: true,
        maxAttendees: 10,
        requireGroupMembership: false,
      });
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );
      mockEventAttendeeService.showEventAttendeesCount!.mockResolvedValue(10);
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Waitlist,
      } as any);

      await service.recordAttendance('full-event', testUserUlid, 'going');

      expect(mockEventAttendeeService.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Waitlist }),
      );
    });

    it('should set Pending status for approval-required event', async () => {
      const mockEvent = {
        id: 6,
        slug: 'approval-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: true,
        user: { id: 10 }, // creator can always attend
        group: null,
      };
      jest.spyOn(service, 'resolveEvent').mockResolvedValue({
        tenantEvent: mockEvent as any,
        uri: null,
        isPublic: false,
        requiresApproval: true,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
      });
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 43,
        status: EventAttendeeStatus.Pending,
      } as any);

      await service.recordAttendance('approval-event', testUserUlid, 'going');

      expect(mockEventAttendeeService.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });
  });

  describe('role determination', () => {
    const mockUser = { id: 10, ulid: 'user-ulid-123', slug: 'user-slug' };

    beforeEach(() => {
      mockUserService.findByUlid!.mockResolvedValue(mockUser as any);
    });

    it('should assign Host role to event creator', async () => {
      const mockEvent = {
        id: 5,
        slug: 'my-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        user: { id: 10 }, // same as mockUser.id — creator
        group: null,
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
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 2,
        name: EventAttendeeRole.Host,
      } as any);
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Confirmed,
      } as any);

      await service.recordAttendance('my-event', testUserUlid, 'going');

      expect(mockEventRoleService.getRoleByName).toHaveBeenCalledWith(
        EventAttendeeRole.Host,
      );
    });

    it('should assign Host role to group admin', async () => {
      const mockEvent = {
        id: 5,
        slug: 'group-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        user: { id: 999 },
        group: { id: 1, slug: 'my-group' },
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
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );
      mockGroupMemberQueryService.findGroupMemberByUserId!.mockResolvedValue({
        id: 1,
        groupRole: { name: 'admin' },
      } as any);
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 2,
        name: EventAttendeeRole.Host,
      } as any);
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Confirmed,
      } as any);

      await service.recordAttendance('group-event', testUserUlid, 'going');

      expect(mockEventRoleService.getRoleByName).toHaveBeenCalledWith(
        EventAttendeeRole.Host,
      );
    });

    it('should assign Participant role to regular user', async () => {
      const mockEvent = {
        id: 5,
        slug: 'regular-event',
        visibility: EventVisibility.Private,
        atprotoUri: null,
        requireApproval: false,
        user: { id: 999 },
        group: { id: 1, slug: 'my-group' },
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
      mockEventAttendeeService.findEventAttendeeByUserId!.mockResolvedValue(
        null,
      );
      mockGroupMemberQueryService.findGroupMemberByUserId!.mockResolvedValue({
        id: 1,
        groupRole: { name: 'member' },
      } as any);
      mockEventRoleService.getRoleByName!.mockResolvedValue({
        id: 1,
        name: EventAttendeeRole.Participant,
      } as any);
      mockEventAttendeeService.create!.mockResolvedValue({
        id: 42,
        status: EventAttendeeStatus.Confirmed,
      } as any);

      await service.recordAttendance('regular-event', testUserUlid, 'going');

      expect(mockEventRoleService.getRoleByName).toHaveBeenCalledWith(
        EventAttendeeRole.Participant,
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
