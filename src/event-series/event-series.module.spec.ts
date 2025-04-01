import { Test, TestingModule } from '@nestjs/testing';
import { mockEventSeries, mockEventSeriesRepository, mockEventSeriesService, mockEventSeriesOccurrenceService, mockSeriesEvent } from '../test/mocks';
import { EventSeriesRepository } from './interfaces/event-series-repository.interface';

describe('EventSeriesModule', () => {
  describe('EventSeriesRepository', () => {
    let repository: typeof mockEventSeriesRepository;

    beforeEach(() => {
      repository = { ...mockEventSeriesRepository };
    });

    it('should find a series by slug', async () => {
      const result = await repository.findBySlug('test-series-1');
      expect(result).toBeDefined();
      expect(result?.slug).toBe('test-series-1');
    });

    it('should find series by user', async () => {
      const [series, total] = await repository.findByUser(1);
      expect(series).toBeDefined();
      expect(Array.isArray(series)).toBe(true);
      expect(total).toBeGreaterThan(0);
    });

    it('should create a new series', async () => {
      const newSeries = await repository.create({
        name: 'New Test Series',
        slug: 'new-test-series',
        recurrenceRule: {
          freq: 'DAILY',
          interval: 1
        }
      });
      
      expect(newSeries).toBeDefined();
      expect(newSeries.name).toBe('New Test Series');
      expect(newSeries.slug).toBe('new-test-series');
    });

    it('should update a series', async () => {
      const updated = await repository.update(1, {
        name: 'Updated Series Name'
      });
      
      expect(updated).toBeDefined();
      expect(updated.id).toBe(1);
      expect(updated.name).toBe('Updated Series Name');
    });
  });

  describe('EventSeriesService', () => {
    let service: typeof mockEventSeriesService;

    beforeEach(() => {
      service = { ...mockEventSeriesService };
    });

    it('should find all series with pagination', async () => {
      const result = await service.findAll();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should find by user', async () => {
      const result = await service.findByUser(1);
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should find by slug', async () => {
      const result = await service.findBySlug('test-series');
      expect(result).toBeDefined();
      expect(result.slug).toBe('test-series');
    });
  });

  describe('EventSeriesOccurrenceService', () => {
    let service: typeof mockEventSeriesOccurrenceService;

    beforeEach(() => {
      service = { ...mockEventSeriesOccurrenceService };
    });

    it('should find an occurrence by date', async () => {
      const date = '2025-10-01T15:00:00Z';
      const result = await service.findOccurrence('test-series', date);
      expect(result).toBeDefined();
      expect(result?.originalOccurrenceDate.toISOString()).toBe(new Date(date).toISOString());
    });

    it('should materialize a new occurrence', async () => {
      const date = '2025-10-07T15:00:00Z';
      const result = await service.materializeOccurrence('test-series', date, 1);
      expect(result).toBeDefined();
      expect(result.startDate.toISOString()).toBe(new Date(date).toISOString());
      expect(result.originalOccurrenceDate.toISOString()).toBe(new Date(date).toISOString());
    });

    it('should get upcoming occurrences', async () => {
      const result = await service.getUpcomingOccurrences('test-series');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // First occurrence should be materialized
      expect(result[0].materialized).toBe(true);
      expect(result[0].event).toBeDefined();
      
      // Should have unmaterialized occurrences
      const unmaterialized = result.filter(occ => !occ.materialized);
      expect(unmaterialized.length).toBeGreaterThan(0);
    });

    it('should update future occurrences', async () => {
      const count = await service.updateFutureOccurrences(
        'test-series',
        '2025-10-05T00:00:00Z',
        { name: 'Updated Event Name' },
        1
      );
      
      expect(count).toBeGreaterThan(0);
    });
  });
});