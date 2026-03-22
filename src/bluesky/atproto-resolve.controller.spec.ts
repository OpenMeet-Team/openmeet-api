import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AtprotoResolveController } from './atproto-resolve.controller';
import { EventQueryService } from '../event/services/event-query.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

describe('AtprotoResolveController', () => {
  let controller: AtprotoResolveController;
  let eventQueryService: {
    findByAtprotoUri: jest.Mock;
    findBySourceAttributes: jest.Mock;
  };
  let configService: { get: jest.Mock };

  const mockRequest = { tenantId: 'test-tenant' };

  beforeEach(async () => {
    eventQueryService = {
      findByAtprotoUri: jest.fn().mockResolvedValue([]),
      findBySourceAttributes: jest.fn().mockResolvedValue([]),
    };

    configService = {
      get: jest.fn().mockReturnValue('https://platform.openmeet.net'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AtprotoResolveController],
      providers: [
        {
          provide: EventQueryService,
          useValue: eventQueryService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    controller = module.get<AtprotoResolveController>(AtprotoResolveController);
  });

  describe('resolve', () => {
    const did = 'did:plc:abc123';
    const collection = 'community.lexicon.calendar.event';
    const rkey = 'abc456';
    const expectedAtUri = `at://${did}/${collection}/${rkey}`;

    it('should resolve an OpenMeet-published event by atprotoUri', async () => {
      const mockEvent = {
        slug: 'my-test-event',
        atprotoUri: expectedAtUri,
      } as unknown as EventEntity;

      eventQueryService.findByAtprotoUri.mockResolvedValue([mockEvent]);

      const result = await controller.resolve(
        did,
        collection,
        rkey,
        mockRequest,
      );

      expect(eventQueryService.findByAtprotoUri).toHaveBeenCalledWith(
        expectedAtUri,
        'test-tenant',
      );
      expect(result).toEqual({
        url: 'https://platform.openmeet.net/events/my-test-event',
        slug: 'my-test-event',
        type: 'event',
      });
    });

    it('should resolve a firehose-ingested event by sourceId when atprotoUri lookup fails', async () => {
      const mockEvent = {
        slug: 'ingested-event',
        sourceType: 'bluesky',
        sourceId: expectedAtUri,
      } as unknown as EventEntity;

      eventQueryService.findByAtprotoUri.mockResolvedValue([]);
      eventQueryService.findBySourceAttributes.mockResolvedValue([mockEvent]);

      const result = await controller.resolve(
        did,
        collection,
        rkey,
        mockRequest,
      );

      expect(eventQueryService.findByAtprotoUri).toHaveBeenCalledWith(
        expectedAtUri,
        'test-tenant',
      );
      expect(eventQueryService.findBySourceAttributes).toHaveBeenCalledWith(
        expectedAtUri,
        'bluesky',
        'test-tenant',
      );
      expect(result).toEqual({
        url: 'https://platform.openmeet.net/events/ingested-event',
        slug: 'ingested-event',
        type: 'event',
      });
    });

    it('should throw NotFoundException when no event matches', async () => {
      eventQueryService.findByAtprotoUri.mockResolvedValue([]);
      eventQueryService.findBySourceAttributes.mockResolvedValue([]);

      await expect(
        controller.resolve(did, collection, rkey, mockRequest),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use FRONTEND_DOMAIN from config', async () => {
      configService.get.mockReturnValue('https://custom.example.com');

      const mockEvent = {
        slug: 'some-event',
        atprotoUri: expectedAtUri,
      } as unknown as EventEntity;

      eventQueryService.findByAtprotoUri.mockResolvedValue([mockEvent]);

      const result = await controller.resolve(
        did,
        collection,
        rkey,
        mockRequest,
      );

      expect(configService.get).toHaveBeenCalledWith('app.frontendDomain', {
        infer: true,
      });
      expect(result.url).toBe('https://custom.example.com/events/some-event');
    });

    it('should throw NotFoundException when FRONTEND_DOMAIN is not configured', async () => {
      configService.get.mockReturnValue(undefined);

      const mockEvent = {
        slug: 'some-event',
        atprotoUri: expectedAtUri,
      } as unknown as EventEntity;

      eventQueryService.findByAtprotoUri.mockResolvedValue([mockEvent]);

      await expect(
        controller.resolve(did, collection, rkey, mockRequest),
      ).rejects.toThrow(
        'FRONTEND_DOMAIN environment variable is not configured',
      );
    });

    it('should throw NotFoundException for unsupported collection', async () => {
      await expect(
        controller.resolve(did, 'app.bsky.feed.post', rkey, mockRequest),
      ).rejects.toThrow(NotFoundException);

      expect(eventQueryService.findByAtprotoUri).not.toHaveBeenCalled();
    });

    it('should prefer atprotoUri match over sourceId match', async () => {
      const nativeEvent = {
        slug: 'native-event',
        atprotoUri: expectedAtUri,
      } as unknown as EventEntity;

      eventQueryService.findByAtprotoUri.mockResolvedValue([nativeEvent]);

      await controller.resolve(did, collection, rkey, mockRequest);

      // Should NOT call findBySourceAttributes since atprotoUri found a match
      expect(eventQueryService.findBySourceAttributes).not.toHaveBeenCalled();
    });
  });
});
