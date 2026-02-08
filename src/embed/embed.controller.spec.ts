import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EmbedController } from './embed.controller';
import { EmbedService } from './embed.service';

describe('EmbedController', () => {
  let controller: EmbedController;
  let embedService: jest.Mocked<Partial<EmbedService>>;

  const mockResponse = () => {
    const res: any = {};
    res.set = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    return res;
  };

  const mockEmbedResult = {
    group: {
      name: 'Test Group',
      slug: 'test-group',
      url: 'https://platform.openmeet.net/groups/test-group',
    },
    events: [
      {
        slug: 'event-1',
        name: 'Event 1',
        description: 'Description',
        startDate: '2026-03-01T18:00:00.000Z',
        endDate: '2026-03-01T20:00:00.000Z',
        timeZone: 'UTC',
        location: 'NYC',
        type: 'in-person',
        imageUrl: null,
        url: 'https://platform.openmeet.net/events/event-1',
        attendeesCount: 5,
      },
    ],
    meta: {
      total: 1,
      limit: 5,
      platformUrl: 'https://platform.openmeet.net',
    },
  };

  beforeEach(async () => {
    embedService = {
      getGroupEvents: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmbedController],
      providers: [
        { provide: EmbedService, useValue: embedService },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();

    controller = module.get<EmbedController>(EmbedController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getGroupEvents', () => {
    it('should return events JSON with correct cache headers', async () => {
      embedService.getGroupEvents!.mockResolvedValue(mockEmbedResult);
      const res = mockResponse();

      await controller.getGroupEvents('test-group', { limit: 5 }, res);

      expect(embedService.getGroupEvents).toHaveBeenCalledWith('test-group', 5);
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      });
      expect(res.json).toHaveBeenCalledWith(mockEmbedResult);
    });

    it('should use default limit of 5', async () => {
      embedService.getGroupEvents!.mockResolvedValue(mockEmbedResult);
      const res = mockResponse();

      await controller.getGroupEvents('test-group', {}, res);

      expect(embedService.getGroupEvents).toHaveBeenCalledWith('test-group', 5);
    });

    it('should return 404 for missing groups', async () => {
      const error = new NotFoundException('Group not found');
      (error as any).status = 404;
      embedService.getGroupEvents!.mockRejectedValue(error);
      const res = mockResponse();

      await controller.getGroupEvents('missing-group', { limit: 5 }, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Group not found' });
    });

    it('should return 500 for unexpected errors', async () => {
      embedService.getGroupEvents!.mockRejectedValue(
        new Error('Database error'),
      );
      const res = mockResponse();

      await controller.getGroupEvents('test-group', { limit: 5 }, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Internal server error',
      });
    });
  });

  describe('getWidgetJs', () => {
    it('should serve JavaScript with correct content type', async () => {
      // Reset the cache to ensure clean test
      (EmbedController as any).widgetJsCache = '(function(){})();';
      const res = mockResponse();

      await controller.getWidgetJs(res);

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=3600',
        }),
      );
      expect(res.send).toHaveBeenCalledWith('(function(){})();');
    });
  });
});
