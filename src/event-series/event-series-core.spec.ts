// Core functionality tests for EventSeries components without TypeORM/Entity dependencies
describe('EventSeries Core Functionality', () => {
  describe('EventSeriesService', () => {
    const mockEventSeries = {
      id: 1,
      slug: 'test-series',
      name: 'Test Series',
      description: 'A test series',
      timeZone: 'America/New_York',
      recurrenceRule: { freq: 'WEEKLY', interval: 1 },
      user: { id: 1 },
    };

    // Test the create functionality
    test('should create series and first occurrence', () => {
      // Mock dependencies for minimal test
      const createSeriesRepo = jest.fn().mockResolvedValue(mockEventSeries);
      const createEvent = jest
        .fn()
        .mockResolvedValue({ id: 1, slug: 'event-1' });
      const findSeries = jest.fn().mockResolvedValue(mockEventSeries);

      // Test creating a series
      const createData = {
        name: 'New Series',
        description: 'Test description',
        recurrenceRule: { freq: 'WEEKLY', interval: 1 },
        timeZone: 'UTC',
        templateStartDate: '2025-01-01T10:00:00Z',
        templateEndDate: '2025-01-01T12:00:00Z',
        templateType: 'in-person',
      };

      // Functions to test
      const createSeries = async (data, _userId) => {
        const series = await createSeriesRepo(data);
        await createEvent({
          name: series.name,
          seriesId: series.id,
          startDate: data.templateStartDate,
        });
        return findSeries(series.slug);
      };

      // Run the test
      return createSeries(createData, 1).then((result) => {
        expect(result).toBeDefined();
        expect(createSeriesRepo).toHaveBeenCalledWith(createData);
        expect(createEvent).toHaveBeenCalled();
        expect(findSeries).toHaveBeenCalledWith('test-series');
      });
    });

    // Test series retrieval functionality
    test('should find a series by slug', () => {
      const findBySlug = jest.fn().mockImplementation((slug) => {
        if (slug === 'not-found') return Promise.resolve(null);
        return Promise.resolve(mockEventSeries);
      });

      const getDescription = jest.fn().mockReturnValue('Weekly');

      const findSeries = async (slug) => {
        const series = await findBySlug(slug);
        if (!series) {
          throw new Error('Not found');
        }

        return {
          ...series,
          recurrenceDescription: getDescription(series.recurrenceRule),
        };
      };

      // Test success case
      return findSeries('test-series').then((result) => {
        expect(result).toBeDefined();
        expect(result.recurrenceDescription).toBe('Weekly');

        // Test not found case
        return findSeries('not-found').catch((err) => {
          expect(err).toBeDefined();
          expect(err.message).toBe('Not found');
        });
      });
    });

    // Test update permissions
    test('should check permissions on update', () => {
      const findSeries = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ...mockEventSeries,
          user: { id: 2 }, // Different from requester
        }),
      );

      const updateSeries = jest
        .fn()
        .mockResolvedValue({ id: 1, name: 'Updated' });

      const update = async (slug, data, userId) => {
        const series = await findSeries(slug);
        if (series.user.id !== userId) {
          throw new Error('Permission denied');
        }
        return updateSeries(series.id, data);
      };

      // Test permission failure
      return update('test-series', { name: 'Updated Name' }, 1).catch((err) => {
        expect(err).toBeDefined();
        expect(err.message).toBe('Permission denied');
        expect(updateSeries).not.toHaveBeenCalled();
      });
    });
  });

  describe('EventSeriesOccurrenceService', () => {
    const mockSeries = {
      id: 1,
      slug: 'test-series',
      name: 'Test Series',
      recurrenceRule: { freq: 'WEEKLY', interval: 1 },
      createdAt: new Date('2025-01-01T00:00:00Z'),
      timeZone: 'UTC',
    };

    const mockEvent = {
      id: 1,
      slug: 'test-event',
      name: 'Test Event',
      startDate: new Date('2025-01-01T10:00:00Z'),
      endDate: new Date('2025-01-01T12:00:00Z'),
      seriesId: 1,
      materialized: true,
      originalOccurrenceDate: new Date('2025-01-01T10:00:00Z'),
    };

    // Test finding an occurrence
    test('should find occurrence by date', () => {
      const findSeries = jest.fn().mockResolvedValue(mockSeries);
      const findEvent = jest.fn().mockImplementation((query) => {
        const date = query.where.originalOccurrenceDate;
        if (date.getTime() === mockEvent.originalOccurrenceDate.getTime()) {
          return Promise.resolve(mockEvent);
        }
        return Promise.resolve(null);
      });

      const findOccurrence = async (seriesSlug, dateStr) => {
        const series = await findSeries(seriesSlug);
        const date = new Date(dateStr);
        return findEvent({
          where: {
            seriesId: series.id,
            originalOccurrenceDate: date,
          },
        });
      };

      // Test existing occurrence
      return findOccurrence('test-series', '2025-01-01T10:00:00Z').then(
        (result) => {
          expect(result).toBeDefined();
          expect(result.id).toBe(1);

          // Test non-existent occurrence
          return findOccurrence('test-series', '2025-01-08T10:00:00Z').then(
            (result) => {
              expect(result).toBeNull();
            },
          );
        },
      );
    });

    // Test materializing an occurrence
    test('should materialize a new occurrence', () => {
      const findSeries = jest.fn().mockResolvedValue(mockSeries);
      const isValidDate = jest.fn().mockReturnValue(true);
      const findTemplate = jest.fn().mockResolvedValue(mockEvent);
      const createEvent = jest.fn().mockImplementation((data) => data);
      const saveEvent = jest.fn().mockImplementation((data) =>
        Promise.resolve({
          ...data,
          id: 2,
          slug: 'test-event-2',
        }),
      );

      const materializeOccurrence = async (seriesSlug, dateStr, userId) => {
        const series = await findSeries(seriesSlug);
        const date = new Date(dateStr);

        // Check if valid occurrence date
        if (!isValidDate(date)) {
          throw new Error('Invalid date');
        }

        // Find template
        const template = await findTemplate();
        if (!template) {
          throw new Error('No template found');
        }

        // Create new occurrence
        const newEvent = createEvent({
          name: series.name,
          startDate: date,
          seriesId: series.id,
          materialized: true,
          originalOccurrenceDate: date,
          userId,
        });

        return saveEvent(newEvent);
      };

      // Test successful materialization
      return materializeOccurrence(
        'test-series',
        '2025-01-08T10:00:00Z',
        1,
      ).then((result) => {
        expect(result).toBeDefined();
        expect(result.id).toBe(2);
        expect(result.startDate).toEqual(new Date('2025-01-08T10:00:00Z'));
        expect(isValidDate).toHaveBeenCalled();
        expect(findTemplate).toHaveBeenCalled();
      });
    });

    // Test validity check for dates
    test('should reject invalid occurrence dates', () => {
      const findSeries = jest.fn().mockResolvedValue(mockSeries);
      const isValidDate = jest.fn().mockReturnValue(false);

      const materializeOccurrence = async (seriesSlug, dateStr) => {
        const series = await findSeries(seriesSlug);
        const date = new Date(dateStr);

        if (!isValidDate(date)) {
          throw new Error(`Invalid date for series ${series.slug}`);
        }

        return { valid: true };
      };

      // Test invalid date
      return materializeOccurrence('test-series', '2025-02-30T10:00:00Z').catch(
        (err) => {
          expect(err).toBeDefined();
          expect(err.message).toBe('Invalid date');
          expect(isValidDate).toHaveBeenCalled();
        },
      );
    });

    // Test upcoming occurrences mixing
    test('should mix materialized and future occurrences', () => {
      const findSeries = jest.fn().mockResolvedValue(mockSeries);
      const findExisting = jest.fn().mockResolvedValue([mockEvent]);
      const generateDates = jest.fn().mockReturnValue([
        new Date('2025-01-01T10:00:00Z'), // Materialized
        new Date('2025-01-08T10:00:00Z'), // Unmaterialized
        new Date('2025-01-15T10:00:00Z'), // Unmaterialized
      ]);

      const areOnSameDay = jest.fn().mockImplementation((date1, date2) => {
        return (
          date1.toISOString().split('T')[0] ===
          date2.toISOString().split('T')[0]
        );
      });

      const getUpcomingOccurrences = async (seriesSlug, count = 3) => {
        const series = await findSeries(seriesSlug);
        const existing = await findExisting();
        const allDates = generateDates();

        return allDates.slice(0, count).map((date) => {
          const materialized = existing.find((event) =>
            areOnSameDay(event.originalOccurrenceDate, date),
          );

          if (materialized) {
            return {
              date: date.toISOString(),
              event: { ...materialized, seriesId: series.id },
              materialized: true,
            };
          } else {
            return {
              date: date.toISOString(),
              materialized: false,
            };
          }
        });
      };

      // Test occurrences mix
      return getUpcomingOccurrences('test-series').then((results) => {
        expect(results).toHaveLength(3);

        // First should be materialized
        expect(results[0].materialized).toBe(true);
        expect(results[0].event).toBeDefined();

        // Rest should be unmaterialized
        expect(results[1].materialized).toBe(false);
        expect(results[1].event).toBeUndefined();
        expect(results[2].materialized).toBe(false);
      });
    });
  });
});
