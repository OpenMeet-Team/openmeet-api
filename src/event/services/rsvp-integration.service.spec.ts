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
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventRoleEntity } from '../../event-role/infrastructure/persistence/relational/entities/event-role.entity';

describe('RsvpIntegrationService', () => {
  let service: RsvpIntegrationService;
  let tenantService: jest.Mocked<TenantConnectionService>;
  let shadowAccountService: jest.Mocked<ShadowAccountService>;
  let eventQueryService: jest.Mocked<EventQueryService>;
  let eventAttendeeService: jest.Mocked<EventAttendeeService>;
  let eventRoleService: jest.Mocked<EventRoleService>;

  let processedCounter: jest.Mock;
  let processingDuration: { startTimer: jest.Mock };

  const mockEvent = {
    id: 1,
    name: 'Test Event',
  } as unknown as EventEntity;

  const mockUser = {
    id: 2,
    firstName: 'Test User',
  } as unknown as UserEntity;

  const mockRole = {
    id: 3,
    name: EventAttendeeRole.Participant,
  } as unknown as EventRoleEntity;

  const mockAttendee = {
    id: 4,
    event: mockEvent,
    user: mockUser,
    role: mockRole,
    status: EventAttendeeStatus.Confirmed,
  } as unknown as EventAttendeesEntity;

  const mockRsvpDto: ExternalRsvpDto = {
    eventSourceId: 'did:plc:1234',
    eventSourceType: EventSourceType.BLUESKY,
    userDid: 'did:plc:abcd',
    userHandle: 'test.bsky.social',
    status: 'going',
    timestamp: '2023-10-15T18:00:00Z',
    sourceId: 'at://did:plc:abcd/app.bsky.rsvp/1234',
  };

  const timerMock = jest.fn();

  beforeEach(async () => {
    processedCounter = jest.fn();
    processingDuration = {
      startTimer: jest.fn(() => timerMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RsvpIntegrationService,
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn(),
          },
        },
        {
          provide: ShadowAccountService,
          useValue: {
            findOrCreateShadowAccount: jest.fn(),
          },
        },
        {
          provide: EventQueryService,
          useValue: {
            findBySourceAttributes: jest.fn(),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            findEventAttendeeByUserId: jest.fn(),
            updateEventAttendee: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(), // Add the save method that was missing
          },
        },
        {
          provide: EventRoleService,
          useValue: {
            getRoleByName: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findByExternalId: jest.fn(),
          },
        },
        {
          provide: BlueskyIdService,
          useValue: {
            parseUri: jest.fn(),
          },
        },
        {
          provide: 'PROM_METRIC_RSVP_INTEGRATION_PROCESSED_TOTAL',
          useValue: { inc: processedCounter },
        },
        {
          provide: 'PROM_METRIC_RSVP_INTEGRATION_PROCESSING_DURATION_SECONDS',
          useValue: processingDuration,
        },
      ],
    }).compile();

    service = module.get<RsvpIntegrationService>(RsvpIntegrationService);
    tenantService = module.get(
      TenantConnectionService,
    ) as jest.Mocked<TenantConnectionService>;
    shadowAccountService = module.get(
      ShadowAccountService,
    ) as jest.Mocked<ShadowAccountService>;
    eventQueryService = module.get(
      EventQueryService,
    ) as jest.Mocked<EventQueryService>;
    eventAttendeeService = module.get(
      EventAttendeeService,
    ) as jest.Mocked<EventAttendeeService>;
    eventRoleService = module.get(
      EventRoleService,
    ) as jest.Mocked<EventRoleService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processExternalRsvp', () => {
    it('should throw BadRequestException if tenant ID is missing', async () => {
      await expect(
        service.processExternalRsvp(mockRsvpDto, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if event is not found', async () => {
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      await expect(
        service.processExternalRsvp(mockRsvpDto, 'test-tenant'),
      ).rejects.toThrow(
        `Event with source ID ${mockRsvpDto.eventSourceId} not found`,
      );
    });

    it('should update existing attendee record if found', async () => {
      // Setup mocks
      tenantService.getTenantConnection.mockResolvedValue({} as any);
      eventQueryService.findBySourceAttributes.mockResolvedValue([mockEvent]);
      shadowAccountService.findOrCreateShadowAccount.mockResolvedValue(
        mockUser,
      );
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue(
        mockAttendee,
      );
      eventRoleService.getRoleByName.mockResolvedValue(mockRole);
      eventAttendeeService.updateEventAttendee.mockResolvedValue({} as any);
      eventAttendeeService.findOne.mockResolvedValue(mockAttendee);
      eventAttendeeService.save.mockResolvedValue(mockAttendee);

      const result = await service.processExternalRsvp(
        mockRsvpDto,
        'test-tenant',
      );

      // Verify interactions
      expect(tenantService.getTenantConnection).toHaveBeenCalledWith(
        'test-tenant',
      );
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        mockRsvpDto.eventSourceId,
        mockRsvpDto.eventSourceType,
        'test-tenant',
      );
      expect(
        shadowAccountService.findOrCreateShadowAccount,
      ).toHaveBeenCalledWith(
        mockRsvpDto.userDid,
        mockRsvpDto.userHandle,
        AuthProvidersEnum.bluesky,
        'test-tenant',
        expect.any(Object),
      );
      expect(
        eventAttendeeService.findEventAttendeeByUserId,
      ).toHaveBeenCalledWith(mockEvent.id, mockUser.id);
      expect(eventAttendeeService.updateEventAttendee).toHaveBeenCalledWith(
        mockAttendee.id,
        {
          status: EventAttendeeStatus.Confirmed,
          role: EventAttendeeRole.Participant,
        },
      );
      expect(eventAttendeeService.findOne).toHaveBeenCalledWith({
        id: mockAttendee.id,
      });
      expect(eventAttendeeService.save).toHaveBeenCalled();
      expect(processedCounter).toHaveBeenCalledWith({
        tenant: 'test-tenant',
        source_type: mockRsvpDto.eventSourceType,
        operation: 'update',
      });
      expect(processingDuration.startTimer).toHaveBeenCalled();
      expect(timerMock).toHaveBeenCalled();
      expect(result).toEqual(mockAttendee);
    });

    it('should create new attendee record if not found', async () => {
      // Setup mocks
      tenantService.getTenantConnection.mockResolvedValue({} as any);
      eventQueryService.findBySourceAttributes.mockResolvedValue([mockEvent]);
      shadowAccountService.findOrCreateShadowAccount.mockResolvedValue(
        mockUser,
      );
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue(null);
      eventRoleService.getRoleByName.mockResolvedValue(mockRole);
      eventAttendeeService.create.mockResolvedValue(mockAttendee);

      const result = await service.processExternalRsvp(
        mockRsvpDto,
        'test-tenant',
      );

      // Verify interactions
      // Using expect.objectContaining to allow for lastSyncedAt Date to be different
      expect(eventAttendeeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          event: mockEvent,
          user: mockUser,
          status: EventAttendeeStatus.Confirmed,
          role: mockRole,
          sourceId: mockRsvpDto.sourceId,
          sourceType: mockRsvpDto.eventSourceType,
          skipBlueskySync: true,
        }),
      );
      expect(processedCounter).toHaveBeenCalledWith({
        tenant: 'test-tenant',
        source_type: mockRsvpDto.eventSourceType,
        operation: 'create',
      });
      expect(result).toEqual(mockAttendee);
    });

    it('should map "interested" status to Maybe', async () => {
      // Setup mocks
      tenantService.getTenantConnection.mockResolvedValue({} as any);
      eventQueryService.findBySourceAttributes.mockResolvedValue([mockEvent]);
      shadowAccountService.findOrCreateShadowAccount.mockResolvedValue(
        mockUser,
      );
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue(null);
      eventRoleService.getRoleByName.mockResolvedValue(mockRole);
      eventAttendeeService.create.mockResolvedValue(mockAttendee);

      const interestedRsvpDto = { ...mockRsvpDto, status: 'interested' };

      await service.processExternalRsvp(interestedRsvpDto, 'test-tenant');

      // Verify correct status is used
      expect(eventAttendeeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Maybe,
        }),
      );
    });

    it('should map "notgoing" status to Cancelled', async () => {
      // Setup mocks
      tenantService.getTenantConnection.mockResolvedValue({} as any);
      eventQueryService.findBySourceAttributes.mockResolvedValue([mockEvent]);
      shadowAccountService.findOrCreateShadowAccount.mockResolvedValue(
        mockUser,
      );
      eventAttendeeService.findEventAttendeeByUserId.mockResolvedValue(null);
      eventRoleService.getRoleByName.mockResolvedValue(mockRole);
      eventAttendeeService.create.mockResolvedValue(mockAttendee);

      const notGoingRsvpDto = { ...mockRsvpDto, status: 'notgoing' };

      await service.processExternalRsvp(notGoingRsvpDto, 'test-tenant');

      // Verify correct status is used
      expect(eventAttendeeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Cancelled,
        }),
      );
    });

    it('should handle errors and stop timer', async () => {
      // Setup mocks
      tenantService.getTenantConnection.mockRejectedValue(
        new Error('Connection error'),
      );

      await expect(
        service.processExternalRsvp(mockRsvpDto, 'test-tenant'),
      ).rejects.toThrow('Connection error');

      expect(processingDuration.startTimer).toHaveBeenCalled();
      expect(timerMock).toHaveBeenCalled();
    });
  });
});
