import { Test, TestingModule } from '@nestjs/testing';
import { AtprotoPublisherService } from './atproto-publisher.service';
import { PdsSessionService, SessionResult } from '../pds/pds-session.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { AtprotoIdentityService } from '../atproto-identity/atproto-identity.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import {
  EventStatus,
  EventVisibility,
  EventAttendeeStatus,
} from '../core/constants/constant';
import { EventSourceType } from '../core/constants/source-type.constant';
import { Logger } from '@nestjs/common';
import { Agent } from '@atproto/api';
import { SessionUnavailableError } from '../pds/pds.errors';
import { PublishResult } from './interfaces/publish-result.interface';

// Mock Agent
const mockAgent = {
  com: {
    atproto: {
      repo: {
        putRecord: jest.fn(),
        deleteRecord: jest.fn(),
      },
    },
  },
} as unknown as Agent;

// Mock SessionResult
const mockSessionResult: SessionResult = {
  agent: mockAgent,
  did: 'did:plc:testuser123',
  isCustodial: true,
  source: 'fresh',
};

// Helper to create mock event
function createMockEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  const event = new EventEntity();
  event.id = 1;
  event.ulid = 'test-ulid-123';
  event.slug = 'test-event-slug';
  event.name = 'Test Event';
  event.description = 'Test description';
  event.startDate = new Date('2026-02-01T10:00:00Z');
  event.endDate = new Date('2026-02-01T12:00:00Z');
  event.status = EventStatus.Published;
  event.visibility = EventVisibility.Public;
  event.sourceType = null;
  event.sourceId = null;
  event.sourceData = null;
  event.atprotoUri = null;
  event.atprotoRkey = null;
  event.atprotoSyncedAt = null;
  event.createdAt = new Date('2026-01-01T00:00:00Z');
  event.updatedAt = new Date('2026-01-01T00:00:00Z');
  event.user = {
    id: 1,
    ulid: 'user-ulid-123',
    slug: 'test-user',
    email: 'test@example.com',
  } as UserEntity;

  Object.assign(event, overrides);
  return event;
}

// Helper to create mock attendee
function createMockAttendee(
  overrides: Partial<EventAttendeesEntity> = {},
): EventAttendeesEntity {
  const attendee = new EventAttendeesEntity();
  attendee.id = 1;
  attendee.status = EventAttendeeStatus.Confirmed;
  attendee.sourceType = null;
  attendee.sourceId = null;
  attendee.sourceData = null;
  attendee.atprotoUri = null;
  attendee.atprotoRkey = null;
  attendee.atprotoSyncedAt = null;
  attendee.createdAt = new Date('2026-01-01T00:00:00Z');
  attendee.updatedAt = new Date('2026-01-01T00:00:00Z');
  attendee.user = {
    id: 2,
    ulid: 'attendee-ulid-456',
  } as UserEntity;
  attendee.event = createMockEvent();

  Object.assign(attendee, overrides);
  return attendee;
}

describe('AtprotoPublisherService', () => {
  let service: AtprotoPublisherService;
  let pdsSessionService: jest.Mocked<PdsSessionService>;
  let blueskyService: jest.Mocked<BlueskyService>;
  let blueskyRsvpService: jest.Mocked<BlueskyRsvpService>;
  let atprotoIdentityService: jest.Mocked<AtprotoIdentityService>;

  const tenantId = 'test-tenant';

  beforeEach(async () => {
    // Create mocks
    pdsSessionService = {
      getSessionForUser: jest.fn(),
    } as unknown as jest.Mocked<PdsSessionService>;

    blueskyService = {
      createEventRecord: jest.fn(),
      deleteEventRecord: jest.fn(),
    } as unknown as jest.Mocked<BlueskyService>;

    blueskyRsvpService = {
      createRsvp: jest.fn(),
    } as unknown as jest.Mocked<BlueskyRsvpService>;

    atprotoIdentityService = {
      ensureIdentityForUser: jest.fn(),
    } as unknown as jest.Mocked<AtprotoIdentityService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoPublisherService,
        { provide: PdsSessionService, useValue: pdsSessionService },
        { provide: BlueskyService, useValue: blueskyService },
        { provide: BlueskyRsvpService, useValue: blueskyRsvpService },
        { provide: AtprotoIdentityService, useValue: atprotoIdentityService },
      ],
    }).compile();

    service = module.get<AtprotoPublisherService>(AtprotoPublisherService);

    // Suppress logging in tests
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldPublishEvent', () => {
    it('should return true for public, published, user-created event', () => {
      const event = createMockEvent({
        status: EventStatus.Published,
        visibility: EventVisibility.Public,
        sourceType: null,
      });

      const result = service['shouldPublishEvent'](event);
      expect(result).toBe(true);
    });

    it('should return false for draft events', () => {
      const event = createMockEvent({
        status: EventStatus.Draft,
        visibility: EventVisibility.Public,
        sourceType: null,
      });

      const result = service['shouldPublishEvent'](event);
      expect(result).toBe(false);
    });

    it('should return false for pending events', () => {
      const event = createMockEvent({
        status: EventStatus.Pending,
        visibility: EventVisibility.Public,
        sourceType: null,
      });

      const result = service['shouldPublishEvent'](event);
      expect(result).toBe(false);
    });

    // Cancelled events SHOULD be published - AT Protocol has a 'cancelled' status
    // that should be visible on the decentralized network
    it('should return true for cancelled events (cancelled is a valid AT Protocol status)', () => {
      const event = createMockEvent({
        status: EventStatus.Cancelled,
        visibility: EventVisibility.Public,
        sourceType: null,
      });

      const result = service['shouldPublishEvent'](event);
      expect(result).toBe(true);
    });

    it('should return false for private events', () => {
      const event = createMockEvent({
        status: EventStatus.Published,
        visibility: EventVisibility.Private,
        sourceType: null,
      });

      const result = service['shouldPublishEvent'](event);
      expect(result).toBe(false);
    });

    it('should return false for unlisted events', () => {
      const event = createMockEvent({
        status: EventStatus.Published,
        visibility: EventVisibility.Unlisted,
        sourceType: null,
      });

      const result = service['shouldPublishEvent'](event);
      expect(result).toBe(false);
    });

    it('should return false for imported Bluesky events', () => {
      const event = createMockEvent({
        status: EventStatus.Published,
        visibility: EventVisibility.Public,
        sourceType: EventSourceType.BLUESKY,
        sourceId: 'at://did:plc:abc/community.lexicon.calendar.event/123',
      });

      const result = service['shouldPublishEvent'](event);
      expect(result).toBe(false);
    });

    it('should return false for events with any sourceType (imported)', () => {
      const event = createMockEvent({
        status: EventStatus.Published,
        visibility: EventVisibility.Public,
        sourceType: EventSourceType.BLUESKY,
      });

      const result = service['shouldPublishEvent'](event);
      expect(result).toBe(false);
    });
  });

  describe('needsRepublish', () => {
    it('should return true if event has no atprotoUri (never published)', () => {
      const event = createMockEvent({
        atprotoUri: null,
        atprotoSyncedAt: null,
      });

      const result = service['needsRepublish'](event);
      expect(result).toBe(true);
    });

    it('should return true if updatedAt is newer than atprotoSyncedAt', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        atprotoSyncedAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      });

      const result = service['needsRepublish'](event);
      expect(result).toBe(true);
    });

    it('should return false if atprotoSyncedAt is equal to or newer than updatedAt', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        atprotoSyncedAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

      const result = service['needsRepublish'](event);
      expect(result).toBe(false);
    });

    it('should return true if atprotoSyncedAt is null but atprotoUri exists', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        atprotoSyncedAt: null,
      });

      const result = service['needsRepublish'](event);
      expect(result).toBe(true);
    });
  });

  describe('publishEvent', () => {
    it('should return skipped for non-eligible events (private)', () => {
      const event = createMockEvent({
        visibility: EventVisibility.Private,
      });

      const result = service.publishEvent(event, tenantId) as PublishResult;

      expect(result.action).toBe('skipped');
      expect(pdsSessionService.getSessionForUser).not.toHaveBeenCalled();
    });

    it('should return skipped for imported events', () => {
      const event = createMockEvent({
        sourceType: EventSourceType.BLUESKY,
      });

      const result = service.publishEvent(event, tenantId) as PublishResult;

      expect(result.action).toBe('skipped');
      expect(pdsSessionService.getSessionForUser).not.toHaveBeenCalled();
    });

    it('should return skipped if already synced and no changes', () => {
      const syncTime = new Date('2026-01-02T00:00:00Z');
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        atprotoRkey: 'rkey',
        atprotoSyncedAt: syncTime,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

      const result = service.publishEvent(event, tenantId) as PublishResult;

      expect(result.action).toBe('skipped');
      expect(blueskyService.createEventRecord).not.toHaveBeenCalled();
    });

    it('should return skipped when no session available', async () => {
      const event = createMockEvent();
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(null);

      const result = await service.publishEvent(event, tenantId);

      expect(result).toEqual({ action: 'skipped' });
    });

    it('should publish event successfully and return result', async () => {
      const event = createMockEvent();
      const rkey = 'test-rkey-123';
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyService.createEventRecord.mockResolvedValue({
        rkey,
        cid: 'bafyreimockcid',
      });

      const result = await service.publishEvent(event, tenantId);

      expect(result.action).toBe('published');
      expect(result.atprotoRkey).toBe(rkey);
      expect(result.atprotoUri).toContain(mockSessionResult.did);
      expect(result.atprotoUri).toContain(rkey);

      expect(blueskyService.createEventRecord).toHaveBeenCalledWith(
        event,
        mockSessionResult.did,
        expect.any(String),
        tenantId,
        mockSessionResult.agent, // Agent from PdsSessionService
      );
    });

    it('should include atprotoCid in publish result', async () => {
      const event = createMockEvent();
      const rkey = 'test-rkey-123';
      const cid = 'bafyreicid789';
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyService.createEventRecord.mockResolvedValue({ rkey, cid });

      const result = await service.publishEvent(event, tenantId);

      expect(result.action).toBe('published');
      expect(result.atprotoRkey).toBe(rkey);
      expect(result.atprotoCid).toBe(cid);
    });

    it('should return updated action when republishing existing event', async () => {
      const event = createMockEvent({
        atprotoUri:
          'at://did:plc:abc/community.lexicon.calendar.event/old-rkey',
        atprotoRkey: 'old-rkey',
        atprotoSyncedAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      });
      const rkey = 'old-rkey';
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyService.createEventRecord.mockResolvedValue({
        rkey,
        cid: 'bafyreimockcid',
      });

      const result = await service.publishEvent(event, tenantId);

      expect(result.action).toBe('updated');
    });

    it('should skip needsRepublish check when force is true', async () => {
      // Event is already synced and has no changes - would normally be skipped
      const syncTime = new Date('2026-01-02T00:00:00Z');
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        atprotoRkey: 'rkey',
        atprotoSyncedAt: syncTime,
        updatedAt: new Date('2026-01-01T00:00:00Z'), // older than syncedAt
      });
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyService.createEventRecord.mockResolvedValue({
        rkey: 'rkey',
        cid: 'bafyreimockcid',
      });

      const result = await service.publishEvent(event, tenantId, {
        force: true,
      });

      // Should publish (update) instead of skipping
      expect(result.action).toBe('updated');
      expect(blueskyService.createEventRecord).toHaveBeenCalled();
    });

    it('should still check shouldPublishEvent even when force is true', () => {
      // Private events should never be published, even with force
      const event = createMockEvent({
        visibility: EventVisibility.Private,
      });

      const result = service.publishEvent(event, tenantId, {
        force: true,
      }) as PublishResult;

      expect(result.action).toBe('skipped');
      expect(blueskyService.createEventRecord).not.toHaveBeenCalled();
    });

    it('should return error result with validationError when BlueskyService throws validation error', async () => {
      const event = createMockEvent();
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyService.createEventRecord.mockRejectedValue(
        new Error(
          'AT Protocol record validation failed: Record must have the property "name"',
        ),
      );

      const result = await service.publishEvent(event, tenantId);

      expect(result.action).toBe('error');
      expect(result.validationError).toContain(
        'AT Protocol record validation failed',
      );
      expect(result.error).toContain('AT Protocol record validation failed');
    });

    it('should return conflict action when putRecord returns 409', async () => {
      const event = createMockEvent();
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);

      // Simulate a 409 InvalidSwap error from AT Protocol
      const conflictError = new Error(
        'InvalidSwap: record was modified externally',
      );
      (conflictError as any).status = 409;
      blueskyService.createEventRecord.mockRejectedValue(conflictError);

      const result = await service.publishEvent(event, tenantId);

      expect(result.action).toBe('conflict');
    });

    it('should return conflict action when error message includes InvalidSwap', async () => {
      const event = createMockEvent();
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);

      // Simulate an InvalidSwap error without status code (message-only detection)
      const conflictError = new Error('InvalidSwap');
      blueskyService.createEventRecord.mockRejectedValue(conflictError);

      const result = await service.publishEvent(event, tenantId);

      expect(result.action).toBe('conflict');
    });

    it('should re-throw non-validation errors from BlueskyService', async () => {
      const event = createMockEvent();
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyService.createEventRecord.mockRejectedValue(
        new Error('Network timeout'),
      );

      await expect(service.publishEvent(event, tenantId)).rejects.toThrow(
        'Network timeout',
      );
    });

    it('should throw when PDS call fails', async () => {
      const event = createMockEvent();
      const mockIdentity = {
        id: 1,
        userUlid: 'user-ulid-123',
        did: 'did:plc:testuser123',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyService.createEventRecord.mockRejectedValue(
        new Error('PDS unavailable'),
      );

      await expect(service.publishEvent(event, tenantId)).rejects.toThrow(
        'PDS unavailable',
      );
    });

    describe('orphan state handling', () => {
      it('should return error result with actionable message when SessionUnavailableError is thrown', async () => {
        const event = createMockEvent();
        const mockIdentity = {
          id: 1,
          userUlid: 'user-ulid-123',
          did: 'did:plc:testuser123',
        } as UserAtprotoIdentityEntity;

        atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
          mockIdentity,
        );
        pdsSessionService.getSessionForUser.mockRejectedValue(
          new SessionUnavailableError(
            'OAuth session expired - please re-link your AT Protocol account',
            true,
          ),
        );

        const result = await service.publishEvent(event, tenantId);

        expect(result.action).toBe('error');
        expect((result as PublishResult & { error: string }).error).toContain(
          'Link your AT Protocol account',
        );
        expect(
          (result as PublishResult & { needsOAuthLink: boolean })
            .needsOAuthLink,
        ).toBe(true);
      });

      it('should include actionable message in error result for RSVP publishing', async () => {
        const event = createMockEvent({
          atprotoUri:
            'at://did:plc:organizer/community.lexicon.calendar.event/event-rkey',
        });
        const attendee = createMockAttendee({
          status: EventAttendeeStatus.Confirmed,
          event,
        });

        pdsSessionService.getSessionForUser.mockRejectedValue(
          new SessionUnavailableError('OAuth session expired', true),
        );

        const result = await service.publishRsvp(attendee, tenantId);

        expect(result.action).toBe('error');
        expect((result as PublishResult & { error: string }).error).toContain(
          'Link your AT Protocol account',
        );
        expect(
          (result as PublishResult & { needsOAuthLink: boolean })
            .needsOAuthLink,
        ).toBe(true);
      });
    });

    describe('lazy identity creation', () => {
      it('should call ensureIdentityForUser before getting session', async () => {
        const event = createMockEvent();
        const rkey = 'test-rkey-123';
        const mockIdentity = {
          id: 1,
          userUlid: 'user-ulid-123',
          did: 'did:plc:testuser123',
        } as UserAtprotoIdentityEntity;

        atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
          mockIdentity,
        );
        pdsSessionService.getSessionForUser.mockResolvedValue(
          mockSessionResult,
        );
        blueskyService.createEventRecord.mockResolvedValue({
          rkey,
          cid: 'bafyreimockcid',
        });

        await service.publishEvent(event, tenantId);

        // Verify ensureIdentityForUser was called with correct arguments
        expect(
          atprotoIdentityService.ensureIdentityForUser,
        ).toHaveBeenCalledWith(tenantId, {
          ulid: 'user-ulid-123',
          slug: expect.any(String),
          email: expect.anything(),
        });

        // Verify it was called before getSessionForUser
        const ensureCallOrder =
          atprotoIdentityService.ensureIdentityForUser.mock
            .invocationCallOrder[0];
        const sessionCallOrder =
          pdsSessionService.getSessionForUser.mock.invocationCallOrder[0];
        expect(ensureCallOrder).toBeLessThan(sessionCallOrder);
      });

      it('should return skipped when ensureIdentityForUser returns null (no identity)', async () => {
        const event = createMockEvent();

        // Identity service returns null (PDS unavailable, user has no slug, etc.)
        atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(null);

        const result = await service.publishEvent(event, tenantId);

        expect(result).toEqual({ action: 'skipped' });
        // Should not attempt to get session when no identity
        expect(pdsSessionService.getSessionForUser).not.toHaveBeenCalled();
      });

      it('should create identity for user without one, then publish successfully', async () => {
        const event = createMockEvent();
        const rkey = 'test-rkey-123';

        // First ensure creates the identity
        const mockIdentity = {
          id: 1,
          userUlid: 'user-ulid-123',
          did: 'did:plc:newlycreated',
          handle: 'test-user.opnmt.me',
          isCustodial: true,
        } as UserAtprotoIdentityEntity;

        atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
          mockIdentity,
        );
        pdsSessionService.getSessionForUser.mockResolvedValue(
          mockSessionResult,
        );
        blueskyService.createEventRecord.mockResolvedValue({
          rkey,
          cid: 'bafyreimockcid',
        });

        const result = await service.publishEvent(event, tenantId);

        expect(result.action).toBe('published');
        expect(atprotoIdentityService.ensureIdentityForUser).toHaveBeenCalled();
      });
    });
  });

  describe('deleteEvent', () => {
    it('should return skipped if event was never published', () => {
      const event = createMockEvent({
        atprotoUri: null,
        atprotoRkey: null,
      });

      const result = service.deleteEvent(event, tenantId) as PublishResult;

      expect(result.action).toBe('skipped');
    });

    it('should delete event from PDS successfully', async () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        atprotoRkey: 'rkey',
      });

      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyService.deleteEventRecord.mockResolvedValue({
        success: true,
        message: 'Deleted',
      });

      const result = await service.deleteEvent(event, tenantId);

      expect(result.action).toBe('deleted');
    });

    it('should throw when session unavailable for delete', async () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        atprotoRkey: 'rkey',
      });

      pdsSessionService.getSessionForUser.mockResolvedValue(null);

      await expect(service.deleteEvent(event, tenantId)).rejects.toThrow(
        /session/i,
      );
    });
  });

  describe('shouldPublishRsvp', () => {
    it('should return true for confirmed attendee on public event with atprotoUri', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Confirmed,
        event,
      });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(true);
    });

    it('should return false if event has no atprotoUri (not published)', () => {
      const event = createMockEvent({
        atprotoUri: null,
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({ event });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(false);
    });

    it('should return false for private events', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Private,
      });
      const attendee = createMockAttendee({ event });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(false);
    });

    // AT Protocol RSVP statuses: going, interested, notgoing
    // OpenMeet → AT Protocol mapping:
    // - Confirmed → going (publish)
    // - Maybe → interested (publish)
    // - Cancelled → notgoing (publish - user explicitly declined)
    // - Rejected → skip (host rejected, internal status)
    // - Pending → skip (awaiting approval)
    // - Waitlist → skip (not confirmed)
    // - Invited → skip (no response yet)
    // - Attended → skip (already published as 'going', post-event tracking)

    it('should return true for maybe status (maps to interested)', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Maybe,
        event,
      });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(true);
    });

    it('should return true for cancelled RSVP (maps to notgoing)', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Cancelled,
        event,
      });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(true);
    });

    it('should return false for rejected RSVP', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Rejected,
        event,
      });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(false);
    });

    it('should return false for pending (awaiting approval) RSVP', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Pending,
        event,
      });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(false);
    });

    it('should return false for waitlist RSVP', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Waitlist,
        event,
      });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(false);
    });

    it('should return false for invited RSVP (no response yet)', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Invited,
        event,
      });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(false);
    });

    it('should return true for attended RSVP (maps to going)', () => {
      const event = createMockEvent({
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey',
        visibility: EventVisibility.Public,
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Attended,
        event,
      });

      const result = service['shouldPublishRsvp'](attendee, event);
      expect(result).toBe(true);
    });
  });

  describe('publishRsvp', () => {
    it('should return skipped for non-eligible RSVPs', () => {
      const event = createMockEvent({ atprotoUri: null });
      const attendee = createMockAttendee({ event });

      const result = service.publishRsvp(attendee, tenantId) as PublishResult;

      expect(result.action).toBe('skipped');
    });

    it('should publish RSVP successfully', async () => {
      const event = createMockEvent({
        atprotoUri:
          'at://did:plc:organizer/community.lexicon.calendar.event/event-rkey',
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Confirmed,
        event,
      });

      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);
      blueskyRsvpService.createRsvp.mockResolvedValue({
        success: true,
        rsvpUri:
          'at://did:plc:testuser123/community.lexicon.calendar.rsvp/rsvp-rkey',
        rsvpCid: 'bafyreicid123',
      });

      const result = await service.publishRsvp(attendee, tenantId);

      expect(result.action).toBe('published');
      expect(result.atprotoUri).toContain('rsvp');
    });

    it('should return skipped when session unavailable', async () => {
      const event = createMockEvent({
        atprotoUri:
          'at://did:plc:organizer/community.lexicon.calendar.event/event-rkey',
      });
      const attendee = createMockAttendee({
        status: EventAttendeeStatus.Confirmed,
        event,
      });

      pdsSessionService.getSessionForUser.mockResolvedValue(null);

      const result = await service.publishRsvp(attendee, tenantId);

      expect(result).toEqual({ action: 'skipped' });
    });
  });

  describe('ensurePublishingCapability', () => {
    const testUser = {
      ulid: 'user-ulid-123',
      slug: 'test-user',
      email: 'test@example.com',
    };

    it('should return identity when user has existing identity and session', async () => {
      const mockIdentity = {
        id: 1,
        userUlid: testUser.ulid,
        did: 'did:plc:existing',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(mockSessionResult);

      const result = await service.ensurePublishingCapability(
        tenantId,
        testUser,
      );

      expect(result).toEqual({ did: 'did:plc:existing', required: true });
      expect(atprotoIdentityService.ensureIdentityForUser).toHaveBeenCalledWith(
        tenantId,
        testUser,
      );
      expect(pdsSessionService.getSessionForUser).toHaveBeenCalledWith(
        tenantId,
        testUser.ulid,
      );
    });

    it('should return null when identity creation fails', async () => {
      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(null);

      const result = await service.ensurePublishingCapability(
        tenantId,
        testUser,
      );

      expect(result).toBeNull();
      expect(pdsSessionService.getSessionForUser).not.toHaveBeenCalled();
    });

    it('should return null when session cannot be obtained', async () => {
      const mockIdentity = {
        id: 1,
        userUlid: testUser.ulid,
        did: 'did:plc:test',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockResolvedValue(null);

      const result = await service.ensurePublishingCapability(
        tenantId,
        testUser,
      );

      expect(result).toBeNull();
    });

    it('should return null when SessionUnavailableError is thrown (orphan state)', async () => {
      const mockIdentity = {
        id: 1,
        userUlid: testUser.ulid,
        did: 'did:plc:test',
      } as UserAtprotoIdentityEntity;

      atprotoIdentityService.ensureIdentityForUser.mockResolvedValue(
        mockIdentity,
      );
      pdsSessionService.getSessionForUser.mockRejectedValue(
        new SessionUnavailableError('OAuth session expired', true),
      );

      const result = await service.ensurePublishingCapability(
        tenantId,
        testUser,
      );

      // Pre-flight check catches the error and returns null
      // (the actual error will be surfaced during publish)
      expect(result).toBeNull();
    });
  });
});
