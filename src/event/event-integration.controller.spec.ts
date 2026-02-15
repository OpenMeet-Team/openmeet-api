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
      deleteExternalEvent: jest.fn(),
    } as any;

    // Configure mock service behavior
    service.processExternalEvent.mockResolvedValue(mockEventResult);
    service.deleteExternalEvent.mockResolvedValue({
      success: true,
      message: 'Event deleted',
    });

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
        slug: 'test-event-abc123',
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

  describe('deleteEventByQuery', () => {
    it('should call service with sourceId and sourceType from query params', async () => {
      const result = await controller.deleteEventByQuery(
        'test-tenant',
        'at://did:plc:abc123/community.lexicon.calendar.event/rkey456',
        'bluesky',
      );

      expect(service.deleteExternalEvent).toHaveBeenCalledWith(
        'at://did:plc:abc123/community.lexicon.calendar.event/rkey456',
        'bluesky',
        'test-tenant',
      );
      expect(result).toEqual({
        success: true,
        message: 'Event deletion request accepted',
      });
    });

    it('should throw UnauthorizedException if tenant ID is missing', async () => {
      await expect(
        controller.deleteEventByQuery('', 'some-id', 'bluesky'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if sourceId is missing', async () => {
      await expect(
        controller.deleteEventByQuery('test-tenant', '', 'bluesky'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if sourceType is missing', async () => {
      await expect(
        controller.deleteEventByQuery('test-tenant', 'some-id', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle service errors properly', async () => {
      service.deleteExternalEvent.mockRejectedValue(
        new Error('Delete failed'),
      );

      await expect(
        controller.deleteEventByQuery('test-tenant', 'some-id', 'bluesky'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteAtprotoEvent', () => {
    it('should construct at:// URI from path components and call service', async () => {
      const result = await controller.deleteAtprotoEvent(
        'test-tenant',
        'did:plc:abc123',
        'community.lexicon.calendar.event',
        'rkey456',
        'bluesky',
      );

      expect(service.deleteExternalEvent).toHaveBeenCalledWith(
        'at://did:plc:abc123/community.lexicon.calendar.event/rkey456',
        'bluesky',
        'test-tenant',
      );
      expect(result).toEqual({
        success: true,
        message: 'Event deleted',
      });
    });

    it('should throw UnauthorizedException if tenant ID is missing', async () => {
      await expect(
        controller.deleteAtprotoEvent(
          '',
          'did:plc:abc123',
          'community.lexicon.calendar.event',
          'rkey456',
          'bluesky',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if any path param is missing', async () => {
      await expect(
        controller.deleteAtprotoEvent(
          'test-tenant',
          '',
          'community.lexicon.calendar.event',
          'rkey456',
          'bluesky',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if sourceType is missing', async () => {
      await expect(
        controller.deleteAtprotoEvent(
          'test-tenant',
          'did:plc:abc123',
          'community.lexicon.calendar.event',
          'rkey456',
          '',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle service errors properly', async () => {
      service.deleteExternalEvent.mockRejectedValue(
        new Error('Delete failed'),
      );

      await expect(
        controller.deleteAtprotoEvent(
          'test-tenant',
          'did:plc:abc123',
          'community.lexicon.calendar.event',
          'rkey456',
          'bluesky',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('route consolidation', () => {
    it('should not have a deleteEventByPath method (catch-all removed)', () => {
      expect((controller as any).deleteEventByPath).toBeUndefined();
    });
  });
});
