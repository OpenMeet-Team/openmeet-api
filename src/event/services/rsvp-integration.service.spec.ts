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
import { EventSourceType } from '../../core/constants/source-type.constant';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
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

    it('should not pass skipBlueskySync in attendeeData (createFromIngestion handles it internally)', async () => {
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
});
