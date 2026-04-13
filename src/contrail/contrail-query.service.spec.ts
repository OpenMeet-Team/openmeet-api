import { Test, TestingModule } from '@nestjs/testing';
import { ContrailQueryService } from './contrail-query.service';
import { TenantConnectionService } from '../tenant/tenant.service';

describe('ContrailQueryService', () => {
  let service: ContrailQueryService;
  let mockDataSource: { query: jest.Mock };
  let tenantConnectionService: { getTenantConnection: jest.Mock };

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    tenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue(mockDataSource),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContrailQueryService,
        {
          provide: TenantConnectionService,
          useValue: tenantConnectionService,
        },
      ],
    }).compile();

    service = module.get<ContrailQueryService>(ContrailQueryService);
  });

  describe('find', () => {
    it('should query the correct table when enabled', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total: '3' }])
        .mockResolvedValueOnce([{ uri: 'at://test', did: 'did:plc:a' }]);

      const result = await service.find('community.lexicon.calendar.event');

      expect(result.total).toBe(3);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('records_community_lexicon_calendar_event'),
        expect.any(Array),
      );
    });

    it('should apply conditions with sequential param numbering', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce([]);

      await service.find('community.lexicon.calendar.event', {
        conditions: [
          { sql: `record->>'startsAt' >= $1`, params: ['2026-01-01'] },
          { sql: `did = $1`, params: ['did:plc:abc'] },
        ],
      });

      // Count query: conditions should be renumbered to $1, $2
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('$1'),
        ['2026-01-01', 'did:plc:abc'],
      );
    });

    it('should reject an invalid orderBy expression', async () => {
      await expect(
        service.find('community.lexicon.calendar.event', {
          orderBy: '1; DROP TABLE users; --',
        }),
      ).rejects.toThrow(/invalid orderBy/i);
    });

    it('should accept a valid orderBy expression', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([]);

      await expect(
        service.find('community.lexicon.calendar.event', {
          orderBy: "record->>'startsAt' ASC, uri ASC",
        }),
      ).resolves.not.toThrow();
    });

    it('should skip the COUNT query when skipCount is true', async () => {
      const mockRecords = [
        {
          uri: 'at://did:plc:a/community.lexicon.calendar.event/1',
          did: 'did:plc:a',
        },
        {
          uri: 'at://did:plc:b/community.lexicon.calendar.event/2',
          did: 'did:plc:b',
        },
      ];
      mockDataSource.query.mockResolvedValueOnce(mockRecords);

      const result = await service.find('community.lexicon.calendar.event', {
        skipCount: true,
        limit: 50,
      });

      // Only one query should have been executed (the SELECT, not the COUNT)
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      expect(result.records).toEqual(mockRecords);
      expect(result.total).toBe(-1);
    });

    it('should still run COUNT query when skipCount is false', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total: '5' }])
        .mockResolvedValueOnce([{ uri: 'at://test', did: 'did:plc:a' }]);

      const result = await service.find('community.lexicon.calendar.event', {
        skipCount: false,
      });

      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(5);
    });

    it('should run COUNT query when skipCount is not specified', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total: '3' }])
        .mockResolvedValueOnce([]);

      const result = await service.find('community.lexicon.calendar.event');

      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(3);
    });
  });

  describe('findWithGeoFilter', () => {
    it('should reject an invalid orderBy in findWithGeoFilter', async () => {
      await expect(
        service.findWithGeoFilter(
          'community.lexicon.calendar.event',
          { lat: 38.25, lon: -85.76, radiusMeters: 16093.4 },
          { orderBy: '1; DROP TABLE users; --' },
        ),
      ).rejects.toThrow(/invalid orderBy/i);
    });
    it('should JOIN atproto_geo_index and use ST_DWithin', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total: '2' }])
        .mockResolvedValueOnce([
          {
            uri: 'at://did:plc:a/community.lexicon.calendar.event/1',
            did: 'did:plc:a',
          },
        ]);

      await service.findWithGeoFilter('community.lexicon.calendar.event', {
        lat: 38.25,
        lon: -85.76,
        radiusMeters: 16093.4,
      });

      // Count query should JOIN atproto_geo_index
      const countSql = mockDataSource.query.mock.calls[0][0];
      expect(countSql).toContain('atproto_geo_index');
      expect(countSql).toContain('ST_DWithin');
      expect(countSql).toContain('count(DISTINCT r.uri)');

      // Geo params: lon, lat, radius
      const countParams = mockDataSource.query.mock.calls[0][1];
      expect(countParams[0]).toBe(-85.76); // lon
      expect(countParams[1]).toBe(38.25); // lat
      expect(countParams[2]).toBe(16093.4); // radiusMeters

      // Page query should also JOIN and GROUP BY
      const pageSql = mockDataSource.query.mock.calls[1][0];
      expect(pageSql).toContain('atproto_geo_index');
      expect(pageSql).toContain('GROUP BY');
    });

    it('should renumber condition params after geo params ($1-$3)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ total: '1' }])
        .mockResolvedValueOnce([]);

      await service.findWithGeoFilter(
        'community.lexicon.calendar.event',
        { lat: 38.25, lon: -85.76, radiusMeters: 16093.4 },
        {
          conditions: [
            { sql: `r.record->>'startsAt' >= $1`, params: ['2026-01-01'] },
            { sql: `r.did = $1`, params: ['did:plc:abc'] },
          ],
        },
      );

      // Params should be: lon, lat, radius, then condition values
      const countParams = mockDataSource.query.mock.calls[0][1];
      expect(countParams).toEqual([
        -85.76,
        38.25,
        16093.4,
        '2026-01-01',
        'did:plc:abc',
      ]);

      // SQL should have $4 and $5 for condition params (not $1, $1)
      const countSql = mockDataSource.query.mock.calls[0][0];
      expect(countSql).toContain('$4');
      expect(countSql).toContain('$5');
    });
  });

  describe('findByUris', () => {
    it('should return records matching multiple URIs in a single query', async () => {
      const mockRecords = [
        {
          uri: 'at://did:plc:abc/community.lexicon.calendar.event/1',
          did: 'did:plc:abc',
          record: { name: 'Event 1' },
        },
        {
          uri: 'at://did:plc:def/community.lexicon.calendar.event/2',
          did: 'did:plc:def',
          record: { name: 'Event 2' },
        },
      ];
      mockDataSource.query.mockResolvedValue(mockRecords);

      const result = await service.findByUris(
        'community.lexicon.calendar.event',
        [
          'at://did:plc:abc/community.lexicon.calendar.event/1',
          'at://did:plc:def/community.lexicon.calendar.event/2',
        ],
      );

      expect(result).toHaveLength(2);
      expect(result[0].uri).toBe(
        'at://did:plc:abc/community.lexicon.calendar.event/1',
      );
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE uri IN'),
        [
          'at://did:plc:abc/community.lexicon.calendar.event/1',
          'at://did:plc:def/community.lexicon.calendar.event/2',
        ],
      );
    });

    it('should return empty array for empty URI list', async () => {
      const result = await service.findByUris(
        'community.lexicon.calendar.event',
        [],
      );
      expect(result).toEqual([]);
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('resolveHandles', () => {
    it('should resolve handles when enabled', async () => {
      mockDataSource.query.mockResolvedValue([
        { did: 'did:plc:abc', handle: 'alice.bsky.social' },
      ]);

      const result = await service.resolveHandles(['did:plc:abc']);

      expect(result.get('did:plc:abc')).toBe('alice.bsky.social');
    });
  });
});
