import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { RsvpIntegrationController } from './rsvp-integration.controller';
import { RsvpIntegrationService } from './services/rsvp-integration.service';
import { ExternalRsvpDto } from './dto/external-rsvp.dto';
import { EventSourceType } from '../core/constants/source-type.constant';
import { ServiceKeyAuthGuard } from '../auth/guards/service-key-auth.guard';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';

describe('RsvpIntegrationController', () => {
  let controller: RsvpIntegrationController;
  let service: jest.Mocked<RsvpIntegrationService>;

  const mockRsvpDto: ExternalRsvpDto = {
    eventSourceId: 'did:plc:1234',
    eventSourceType: EventSourceType.BLUESKY,
    userDid: 'did:plc:abcd',
    userHandle: 'test.bsky.social',
    status: 'going',
    timestamp: '2023-10-15T18:00:00Z',
    sourceId: 'at://did:plc:abcd/app.bsky.rsvp/1234',
  };

  // Create a mock for EventAttendeesEntity
  const mockAttendeeResult = {
    id: 1,
    event: { id: 100 },
    user: { id: 200 },
    status: 'Confirmed',
    role: { id: 1, name: 'Participant' },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as EventAttendeesEntity;

  beforeEach(async () => {
    const serviceMock = {
      processExternalRsvp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RsvpIntegrationController],
      providers: [
        {
          provide: RsvpIntegrationService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(ServiceKeyAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RsvpIntegrationController>(
      RsvpIntegrationController,
    );
    service = module.get(
      RsvpIntegrationService,
    ) as jest.Mocked<RsvpIntegrationService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('ingestRsvp', () => {
    it('should successfully process an RSVP', async () => {
      service.processExternalRsvp.mockResolvedValue(mockAttendeeResult);

      const result = await controller.ingestRsvp('test-tenant', mockRsvpDto);

      expect(service.processExternalRsvp).toHaveBeenCalledWith(
        mockRsvpDto,
        'test-tenant',
      );
      expect(result).toEqual({
        success: true,
        message: 'RSVP accepted for processing',
        attendeeId: mockAttendeeResult.id,
      });
    });

    it('should throw UnauthorizedException when tenant ID is missing', async () => {
      await expect(controller.ingestRsvp('', mockRsvpDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw BadRequestException when service throws an error', async () => {
      service.processExternalRsvp.mockRejectedValue(
        new Error('Event not found'),
      );

      await expect(
        controller.ingestRsvp('test-tenant', mockRsvpDto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
