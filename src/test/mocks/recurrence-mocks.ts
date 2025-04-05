// Recurrence and date-related mocks
export const mockRecurrenceRule = {
  frequency: 'WEEKLY',
  interval: 1,
  byweekday: ['MO', 'WE', 'FR'],
};

export const mockRecurrencePatternService = {
  isDateInRecurrencePattern: jest.fn().mockReturnValue(true),
  generateOccurrences: jest.fn().mockImplementation(() => {
    // Mock implementation that returns a series of dates
    const startDate = new Date('2025-01-01T10:00:00Z');
    const dates: Date[] = [];
    for (let i = 0; i < 10; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i * 7); // weekly
      dates.push(date);
    }
    return dates;
  }),
  formatDateInTimeZone: jest
    .fn()
    .mockImplementation((date, _timeZone, _options) => {
      const d = new Date(date);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }),
  buildRRuleString: jest
    .fn()
    .mockReturnValue('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'),
};

// Legacy name for backward compatibility
export const mockRecurrenceService = mockRecurrencePatternService;
