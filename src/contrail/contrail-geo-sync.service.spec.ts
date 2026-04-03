import { Test, TestingModule } from '@nestjs/testing';
import { ContrailGeoSyncService } from './contrail-geo-sync.service';
import { ContrailQueryService } from './contrail-query.service';

describe('ContrailGeoSyncService', () => {
  let service: ContrailGeoSyncService;
  let mockContrailService: any;
  let mockDataSource: any;

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    mockContrailService = {
      getPublicDataSource: jest.fn().mockResolvedValue(mockDataSource),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContrailGeoSyncService,
        {
          provide: ContrailQueryService,
          useValue: mockContrailService,
        },
      ],
    }).compile();

    service = module.get<ContrailGeoSyncService>(ContrailGeoSyncService);
  });

  describe('sync', () => {
    it('should insert geo points for events with location data', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            uri: 'at://did:plc:aaa/community.lexicon.calendar.event/aaa',
            record: {
              name: 'Geo Event',
              locations: [
                {
                  latitude: '38.2527',
                  longitude: '-85.7585',
                  name: 'Louisville, KY',
                  $type: 'community.lexicon.location.geo',
                },
              ],
            },
          },
        ])
        .mockResolvedValueOnce([]) // insert
        .mockResolvedValueOnce([]); // prune

      await service.sync();

      const insertCall = mockDataSource.query.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[1]).toContain(-85.7585);
      expect(insertCall[1]).toContain(38.2527);
    });

    it('should handle events with multiple locations', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          {
            uri: 'at://did:plc:aaa/community.lexicon.calendar.event/multi',
            record: {
              name: 'Multi-venue Event',
              locations: [
                { latitude: '38.25', longitude: '-85.75', name: 'Venue A' },
                { latitude: '40.71', longitude: '-74.01', name: 'Venue B' },
              ],
            },
          },
        ])
        .mockResolvedValueOnce([]) // insert for location 0
        .mockResolvedValueOnce([]) // insert for location 1
        .mockResolvedValueOnce([]); // prune

      await service.sync();

      const insertCalls = mockDataSource.query.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT'),
      );
      expect(insertCalls).toHaveLength(2);
      // First location
      expect(insertCalls[0][1]).toContain(-85.75);
      expect(insertCalls[0][1]).toContain(38.25);
      expect(insertCalls[0][1]).toContain(0); // location_idx
      // Second location
      expect(insertCalls[1][1]).toContain(-74.01);
      expect(insertCalls[1][1]).toContain(40.71);
      expect(insertCalls[1][1]).toContain(1); // location_idx
    });

    it('should continue inserting remaining records when one INSERT fails', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          // Two records returned by the SELECT
          {
            uri: 'at://did:plc:bad/community.lexicon.calendar.event/bad',
            record: {
              locations: [
                { latitude: '38.25', longitude: '-85.75', name: 'Bad' },
              ],
            },
          },
          {
            uri: 'at://did:plc:good/community.lexicon.calendar.event/good',
            record: {
              locations: [
                { latitude: '40.71', longitude: '-74.01', name: 'Good' },
              ],
            },
          },
        ])
        // First INSERT throws
        .mockRejectedValueOnce(new Error('invalid coordinates'))
        // Second INSERT succeeds
        .mockResolvedValueOnce([])
        // Prune
        .mockResolvedValueOnce([]);

      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      await service.sync();

      // The second INSERT should still have been called
      const insertCalls = mockDataSource.query.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT'),
      );
      expect(insertCalls).toHaveLength(2);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'at://did:plc:bad/community.lexicon.calendar.event/bad',
        ),
      );
    });

    it('should log debug when sync is skipped due to mutex', async () => {
      // Make the datasource query never resolve to keep syncing=true
      const neverResolve = new Promise(() => {});
      mockDataSource.query.mockReturnValue(neverResolve);

      const loggerSpy = jest.spyOn(service['logger'], 'debug');

      // Start first sync (will hang) - intentionally not awaited
      void service.sync();

      // Second sync should be skipped
      await service.sync();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Geo sync skipped: previous cycle still running',
      );

      // Clean up: reset syncing flag manually so test doesn't hang
      (service as any).syncing = false;
    });

    it('should prune orphaned geo index entries', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([]) // No new records
        .mockResolvedValueOnce([]); // Prune call

      await service.sync();

      const pruneCall = mockDataSource.query.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('DELETE'),
      );
      expect(pruneCall).toBeDefined();
    });
  });
});
