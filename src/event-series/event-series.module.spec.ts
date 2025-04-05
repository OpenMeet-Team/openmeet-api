import { mockEventSeriesRepository } from '../test/mocks';

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
          interval: 1,
        },
      });

      expect(newSeries).toBeDefined();
      expect(newSeries.name).toBe('New Test Series');
      expect(newSeries.slug).toBe('new-test-series');
    });

    it('should update a series', async () => {
      const updated = await repository.update(1, {
        name: 'Updated Series Name',
      });

      expect(updated).toBeDefined();
      expect(updated.id).toBe(1);
      expect(updated.name).toBe('Updated Series Name');
    });
  });
});
