import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RsvpIntegrationService } from './rsvp-integration.service';
import { ExternalRsvpDto } from '../dto/external-rsvp.dto';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ShadowAccountService } from '../../shadow-account/shadow-account.service';
import { EventQueryService } from './event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { UserService } from '../../user/user.service';
import { BlueskyIdService } from '../../bluesky/bluesky-id.service';
import { GroupMemberQueryService } from '../../group-member/group-member-query.service';
import { EventSourceType } from '../../core/constants/source-type.constant';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
  GroupRole,
} from '../../core/constants/constant';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventRoleEntity } from '../../event-role/infrastructure/persistence/relational/entities/event-role.entity';

/**
 * Unit tests for RsvpIntegrationService
 *
 * These tests focus on isolated logic that can be meaningfully unit tested:
 * - Input validation
 * - Status mapping logic
 * - Error handling
 *
 * Integration behavior (database operations, service interactions) is tested
 * in the e2e tests: test/event/bluesky-rsvp-integration.e2e-spec.ts
 */
describe('RsvpIntegrationService', () => {
  let service: RsvpIntegrationService;
  let eventQueryService: jest.Mocked<EventQueryService>;
  let eventAttendeeService: jest.Mocked<EventAttendeeService>;
  let groupMemberQueryService: jest.Mocked<GroupMemberQueryService>;

  const mockEvent = { id: 1, name: 'Test Event' } as unknown as EventEntity;
  const mockUser = { id: 2, firstName: 'Test User' } as unknown as UserEntity;
  const mockRole = {
    id: 3,
    name: EventAttendeeRole.Participant,
  } as unknown as EventRoleEntity;

  const mockRsvpDto: ExternalRsvpDto = {
    eventSourceId: 'at://did:plc:1234/community.lexicon.calendar.event/1234',
    eventSourceType: EventSourceType.BLUESKY,
    userDid: 'did:plc:abcd',
    userHandle: 'test.bsky.social',
    status: 'going',
    timestamp: '2023-10-15T18:00:00Z',
    sourceId: 'at://did:plc:abcd/community.lexicon.calendar.rsvp/1234',
  };

  const timerMock = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RsvpIntegrationService,
        {
          provide: TenantConnectionService,
          useValue: { getTenantConnection: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: ShadowAccountService,
          useValue: {
            findOrCreateShadowAccount: jest.fn().mockResolvedValue(mockUser),
          },
        },
        {
          provide: EventQueryService,
          useValue: {
            findBySourceAttributes: jest.fn(),
            findByAtprotoUri: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            findEventAttendeeByUserId: jest.fn().mockResolvedValue(null),
            updateEventAttendee: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            createFromIngestion: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: EventRoleService,
          useValue: { getRoleByName: jest.fn().mockResolvedValue(mockRole) },
        },
        {
          provide: UserService,
          useValue: { findByExternalId: jest.fn() },
        },
        {
          provide: BlueskyIdService,
          useValue: { parseUri: jest.fn() },
        },
        {
          provide: GroupMemberQueryService,
          useValue: {
            findGroupMemberByUserId: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: 'PROM_METRIC_RSVP_INTEGRATION_PROCESSED_TOTAL',
          useValue: { inc: jest.fn() },
        },
        {
          provide: 'PROM_METRIC_RSVP_INTEGRATION_PROCESSING_DURATION_SECONDS',
          useValue: { startTimer: jest.fn(() => timerMock) },
        },
      ],
    }).compile();

    service = module.get<RsvpIntegrationService>(RsvpIntegrationService);
    eventQueryService = module.get(
      EventQueryService,
    ) as jest.Mocked<EventQueryService>;
    eventAttendeeService = module.get(
      EventAttendeeService,
    ) as jest.Mocked<EventAttendeeService>;
    groupMemberQueryService = module.get(
      GroupMemberQueryService,
    ) as jest.Mocked<GroupMemberQueryService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processExternalRsvp - input validation', () => {
    it('should throw BadRequestException if tenant ID is empty', async () => {
      await expect(
        service.processExternalRsvp(mockRsvpDto, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if eventSourceId is not an AT Protocol URI', async () => {
      const invalidDto = {
        ...mockRsvpDto,
        eventSourceId: 'not-a-valid-uri',
      };

      eventQueryService.findBySourceAttributes.mockResolvedValue([mockEvent]);

      await expect(
        service.processExternalRsvp(invalidDto, 'test-tenant'),
      ).rejects.toThrow('Event source ID must be a valid AT Protocol URI');
    });

    it('should throw error if event is not found', async () => {
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      await expect(
        service.processExternalRsvp(mockRsvpDto, 'test-tenant'),
      ).rejects.toThrow(
        `Event with source ID ${mockRsvpDto.eventSourceId} not found`,
      );
    });
  });

  describe('processExternalRsvp - status mapping', () => {
    beforeEach(() => {
      eventQueryService.findBySourceAttributes.mockResolvedValue([mockEvent]);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue(null);
    });

    it('should map "going" status to Confirmed', async () => {
      const mockAttendee = { id: 1, status: EventAttendeeStatus.Confirmed };
      eventAttendeeService.createFromIngestion.mockResolvedValue(
        mockAttendee as unknown as EventAttendeesEntity,
      );

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Confirmed,
        }),
      );
    });

    it('should map "interested" status to Maybe', async () => {
      const mockAttendee = { id: 1, status: EventAttendeeStatus.Maybe };
      eventAttendeeService.createFromIngestion.mockResolvedValue(
        mockAttendee as unknown as EventAttendeesEntity,
      );

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'interested' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Maybe,
        }),
      );
    });

    it('should map "notgoing" status to Cancelled', async () => {
      const mockAttendee = { id: 1, status: EventAttendeeStatus.Cancelled };
      eventAttendeeService.createFromIngestion.mockResolvedValue(
        mockAttendee as unknown as EventAttendeesEntity,
      );

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'notgoing' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Cancelled,
        }),
      );
    });

    it('should default unknown status to Pending', async () => {
      const mockAttendee = { id: 1, status: EventAttendeeStatus.Pending };
      eventAttendeeService.createFromIngestion.mockResolvedValue(
        mockAttendee as unknown as EventAttendeesEntity,
      );

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'unknown-status' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Pending,
        }),
      );
    });
  });

  describe('processExternalRsvp - uses createFromIngestion for firehose RSVPs', () => {
    beforeEach(() => {
      eventQueryService.findBySourceAttributes.mockResolvedValue([mockEvent]);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue(null);
    });

    it('should call createFromIngestion() (not create()) for firehose RSVPs', async () => {
      const mockAttendee = { id: 1, status: EventAttendeeStatus.Confirmed };
      eventAttendeeService.createFromIngestion.mockResolvedValue(
        mockAttendee as unknown as EventAttendeesEntity,
      );

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({
          event: mockEvent,
          user: mockUser,
          status: EventAttendeeStatus.Confirmed,
        }),
      );
      expect(eventAttendeeService.create).not.toHaveBeenCalled();
    });

    it('should not pass sync flags in attendeeData (createFromIngestion skips sync internally)', async () => {
      const mockAttendee = { id: 1, status: EventAttendeeStatus.Confirmed };
      eventAttendeeService.createFromIngestion.mockResolvedValue(
        mockAttendee as unknown as EventAttendeesEntity,
      );

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      const callArgs =
        eventAttendeeService.createFromIngestion.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('skipBlueskySync');
    });
  });

  describe('deleteExternalRsvp - input validation', () => {
    it('should throw BadRequestException if tenant ID is empty', async () => {
      await expect(
        service.deleteExternalRsvp('some-source-id', 'bluesky', ''),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('processExternalRsvp - native event lookup fallback', () => {
    beforeEach(() => {
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue(null);
    });

    it('should fall back to atprotoUri lookup for native OpenMeet events', async () => {
      // Arrange - native event that was published to AT Protocol
      const nativeEvent = {
        id: 100,
        name: 'Native OpenMeet Event',
        atprotoUri:
          'at://did:plc:openmeet/community.lexicon.calendar.event/native123',
        atprotoRkey: 'native123',
        sourceType: null, // Native event - no sourceType
      } as unknown as EventEntity;

      // findBySourceAttributes returns empty (no imported event with this sourceId)
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);
      // But findByAtprotoUri finds the native event
      (eventQueryService as any).findByAtprotoUri = jest
        .fn()
        .mockResolvedValue([nativeEvent]);

      const nativeEventRsvp: ExternalRsvpDto = {
        ...mockRsvpDto,
        eventSourceId:
          'at://did:plc:openmeet/community.lexicon.calendar.event/native123',
      };

      const mockAttendee = { id: 1, status: EventAttendeeStatus.Confirmed };
      eventAttendeeService.createFromIngestion.mockResolvedValue(
        mockAttendee as unknown as EventAttendeesEntity,
      );

      // Act
      await service.processExternalRsvp(nativeEventRsvp, 'test-tenant');

      // Assert - should have tried atprotoUri lookup after sourceAttributes failed
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalled();
      expect((eventQueryService as any).findByAtprotoUri).toHaveBeenCalledWith(
        'at://did:plc:openmeet/community.lexicon.calendar.event/native123',
        'test-tenant',
      );
      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalled();
    });
  });

  describe('processExternalRsvp - membership/approval gate', () => {
    const groupId = 10;
    const membersOnlyEvent = {
      id: 42,
      name: 'Members Only Event',
      requireGroupMembership: true,
      requireApproval: false,
      group: { id: groupId },
    } as unknown as EventEntity;

    beforeEach(() => {
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        membersOnlyEvent,
      ]);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue(null);
      eventAttendeeService.createFromIngestion.mockResolvedValue({
        id: 1,
      } as unknown as EventAttendeesEntity);
    });

    it('should hold a non-member "going" RSVP to a members-only event as Pending', async () => {
      groupMemberQueryService.findGroupMemberByUserId.mockResolvedValue(null);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      // Membership is checked against the loaded group relation, not a stale undefined
      expect(
        groupMemberQueryService.findGroupMemberByUserId,
      ).toHaveBeenCalledWith(groupId, mockUser.id, 'test-tenant');
      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });

    it('should confirm a real group member RSVP to a members-only event', async () => {
      groupMemberQueryService.findGroupMemberByUserId.mockResolvedValue({
        groupRole: { name: 'member' },
      } as any);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Confirmed }),
      );
    });

    it('should hold a guest RSVP to a members-only event as Pending', async () => {
      groupMemberQueryService.findGroupMemberByUserId.mockResolvedValue({
        groupRole: { name: GroupRole.Guest },
      } as any);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });

    it('should hold an approval-required RSVP as Pending even for a member', async () => {
      const approvalEvent = {
        id: 43,
        requireGroupMembership: true,
        requireApproval: true,
        group: { id: groupId },
      } as unknown as EventEntity;
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        approvalEvent,
      ]);
      groupMemberQueryService.findGroupMemberByUserId.mockResolvedValue({
        groupRole: { name: 'member' },
      } as any);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });

    it('should confirm a "going" RSVP to an open event without a membership lookup', async () => {
      const openEvent = {
        id: 44,
        requireGroupMembership: false,
        requireApproval: false,
      } as unknown as EventEntity;
      eventQueryService.findBySourceAttributes.mockResolvedValue([openEvent]);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Confirmed }),
      );
      expect(
        groupMemberQueryService.findGroupMemberByUserId,
      ).not.toHaveBeenCalled();
    });

    it('should not gate a non-affirmative status ("interested" -> Maybe) and should skip the lookup', async () => {
      groupMemberQueryService.findGroupMemberByUserId.mockResolvedValue(null);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'interested' },
        'test-tenant',
      );

      expect(eventAttendeeService.createFromIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ status: EventAttendeeStatus.Maybe }),
      );
      expect(
        groupMemberQueryService.findGroupMemberByUserId,
      ).not.toHaveBeenCalled();
    });

    it('should re-hold an already-present non-member attendee as Pending on re-sync (update path gated)', async () => {
      groupMemberQueryService.findGroupMemberByUserId.mockResolvedValue(null);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue({
        id: 99,
        status: EventAttendeeStatus.Confirmed,
        role: { name: EventAttendeeRole.Participant },
      } as unknown as EventAttendeesEntity);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.updateEventAttendee).toHaveBeenCalledWith(
        99,
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });

    it('should NOT revoke an organizer-approved (Confirmed) attendee when an approval-required RSVP is replayed', async () => {
      // Regression: after an organizer approves an external RSVP, a retry /
      // resync / metadata update for the unchanged "going" record must not flip
      // the Confirmed attendee back to Pending.
      const approvalEvent = {
        id: 43,
        requireGroupMembership: false,
        requireApproval: true,
      } as unknown as EventEntity;
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        approvalEvent,
      ]);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue({
        id: 77,
        status: EventAttendeeStatus.Confirmed,
        role: { name: EventAttendeeRole.Participant },
      } as unknown as EventAttendeesEntity);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.updateEventAttendee).toHaveBeenCalledWith(
        77,
        expect.objectContaining({ status: EventAttendeeStatus.Confirmed }),
      );
      expect(eventAttendeeService.updateEventAttendee).not.toHaveBeenCalledWith(
        77,
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });

    it('should still hold a not-yet-approved (Pending) attendee as Pending on replay of an approval-required RSVP', async () => {
      // A replay before the organizer has decided must stay Pending — the gate
      // only preserves an approval that was actually granted (Confirmed).
      const approvalEvent = {
        id: 43,
        requireGroupMembership: false,
        requireApproval: true,
      } as unknown as EventEntity;
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        approvalEvent,
      ]);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue({
        id: 78,
        status: EventAttendeeStatus.Pending,
        role: { name: EventAttendeeRole.Participant },
      } as unknown as EventAttendeesEntity);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.updateEventAttendee).toHaveBeenCalledWith(
        78,
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });

    it('should re-hold an approved attendee who has since lost group membership (membership still rechecked)', async () => {
      // Approval preservation must NOT override the membership recheck: a
      // members-only event whose confirmed attendee is no longer a member is
      // held again, matching the web path's re-deny of a non-member.
      const membersOnlyApprovalEvent = {
        id: 45,
        requireGroupMembership: true,
        requireApproval: true,
        group: { id: groupId },
      } as unknown as EventEntity;
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        membersOnlyApprovalEvent,
      ]);
      groupMemberQueryService.findGroupMemberByUserId.mockResolvedValue(null);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue({
        id: 79,
        status: EventAttendeeStatus.Confirmed,
        role: { name: EventAttendeeRole.Participant },
      } as unknown as EventAttendeesEntity);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.updateEventAttendee).toHaveBeenCalledWith(
        79,
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });

    it('should keep an eligible member Confirmed on re-sync of a members-only event (idempotent, no churn)', async () => {
      // Happy-path idempotency for the membership branch: a still-eligible
      // member who is already Confirmed stays Confirmed on replay.
      const membersOnlyEvent2 = {
        id: 46,
        requireGroupMembership: true,
        requireApproval: false,
        group: { id: groupId },
      } as unknown as EventEntity;
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        membersOnlyEvent2,
      ]);
      groupMemberQueryService.findGroupMemberByUserId.mockResolvedValue({
        groupRole: { name: 'member' },
      } as any);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue({
        id: 80,
        status: EventAttendeeStatus.Confirmed,
        role: { name: EventAttendeeRole.Participant },
      } as unknown as EventAttendeesEntity);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.updateEventAttendee).toHaveBeenCalledWith(
        80,
        expect.objectContaining({ status: EventAttendeeStatus.Confirmed }),
      );
    });

    it('should re-hold a previously cancelled attendee as Pending when they re-RSVP going to an approval-required event', async () => {
      // A cancelled -> going transition is a genuinely new affirmative request,
      // not a replay of an approved one, so it goes back through approval.
      const approvalEvent = {
        id: 43,
        requireGroupMembership: false,
        requireApproval: true,
      } as unknown as EventEntity;
      eventQueryService.findBySourceAttributes.mockResolvedValue([
        approvalEvent,
      ]);
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue({
        id: 81,
        status: EventAttendeeStatus.Cancelled,
        role: { name: EventAttendeeRole.Participant },
      } as unknown as EventAttendeesEntity);

      await service.processExternalRsvp(
        { ...mockRsvpDto, status: 'going' },
        'test-tenant',
      );

      expect(eventAttendeeService.updateEventAttendee).toHaveBeenCalledWith(
        81,
        expect.objectContaining({ status: EventAttendeeStatus.Pending }),
      );
    });
  });
});
