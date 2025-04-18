import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { EventIntegrationController } from './event-integration.controller';
import { EventIntegrationService } from './services/event-integration.service';
import { ExternalEventDto } from './dto/external-event.dto';
import { EventSourceType } from '../core/constants/source-type.constant';
import {
  EventType,
  EventStatus,
  EventVisibility,
} from '../core/constants/constant';
import { ServiceKeyAuthGuard } from '../auth/guards/service-key-auth.guard';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';

describe('EventIntegrationController', () => {
  let controller: EventIntegrationController;
  let service: jest.Mocked<EventIntegrationService>;

  const mockEventDto: ExternalEventDto = {
    name: 'Test Event',
    description: 'Test Description',
    startDate: '2023-10-15T18:00:00Z',
    endDate: '2023-10-15T20:00:00Z',
    type: EventType.InPerson,
    source: {
      type: EventSourceType.BLUESKY,
      id: 'did:plc:1234',
      handle: 'test.bsky.social',
      url: 'https://bsky.app/profile/test.bsky.social/post/1234',
      metadata: {
        rkey: '1234',
      },
    },
  };

  // Create a proper mock of EventEntity with required properties and methods
  const mockEventResult = {
    id: 1,
    name: 'Test Event',
    slug: 'test-event-abc123',
    createdAt: new Date(),
    updatedAt: new Date(),
    ulid: 'abcdef123456',
    type: EventType.InPerson,
    description: 'Test Description',
    startDate: new Date('2023-10-15T18:00:00Z'),
    endDate: new Date('2023-10-15T20:00:00Z'),
    status: EventStatus.Published,
    visibility: EventVisibility.Public,
    locationOnline: '',
    generateUlid: jest.fn(),
    generateSlug: jest.fn(),
    setEntityName: jest.fn(),
    toJSON: jest.fn(),
    reload: jest.fn(),
    hasId: jest.fn(),
    remove: jest.fn(),
    softRemove: jest.fn(),
    recover: jest.fn(),
  } as unknown as EventEntity;

  beforeEach(async () => {
    // Create mock service
    service = {
      processExternalEvent: jest.fn(),
    } as any;

    // Configure mockservice behavior
    service.processExternalEvent.mockResolvedValue(mockEventResult);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventIntegrationController],
      providers: [
        {
          provide: EventIntegrationService,
          useValue: service,
        },
      ],
    })
      // Skip the auth guard for unit tests
      .overrideGuard(ServiceKeyAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EventIntegrationController>(
      EventIntegrationController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('ingestEvent', () => {
    it('should process the event and return a success response', async () => {
      // Act
      const tenantId = 'test-tenant';
      const result = await controller.ingestEvent(tenantId, mockEventDto);

      // Assert
      expect(service.processExternalEvent).toHaveBeenCalledWith(
        mockEventDto,
        tenantId,
      );
      expect(result).toEqual({
        success: true,
        message: 'Event accepted for processing',
        eventId: 1,
      });
    });

    it('should throw an error if tenant ID is missing', async () => {
      // Act & Assert
      await expect(controller.ingestEvent('', mockEventDto)).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(
        controller.ingestEvent(null as any, mockEventDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle errors properly', async () => {
      // Arrange
      service.processExternalEvent.mockRejectedValue(new Error('Test error'));

      // Act & Assert
      await expect(
        controller.ingestEvent('test-tenant', mockEventDto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
