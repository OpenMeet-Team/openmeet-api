import { validate } from 'class-validator';
import { CreateEventDto } from './create-event.dto';
import { EventType, EventStatus, EventVisibility } from '../../core/constants/constant';

describe('CreateEventDto - End Date Validation', () => {
  it('should fail validation when end date is before start date', async () => {
    const dto = new CreateEventDto();
    dto.name = 'Test Event';
    dto.description = 'Test description';
    dto.type = EventType.InPerson;
    dto.status = EventStatus.Published;
    dto.visibility = EventVisibility.Public;
    dto.timeZone = 'America/Vancouver';
    dto.startDate = '2025-11-13T02:00:00.000Z' as unknown as Date; // 6pm PST
    dto.endDate = '2025-11-12T17:00:00.000Z' as unknown as Date;   // 9am PST previous day

    const errors = await validate(dto);
    const endDateError = errors.find((e) => e.property === 'endDate');

    expect(endDateError).toBeDefined();
    expect(endDateError?.constraints).toHaveProperty('IsAfterStartDate');
    expect(endDateError?.constraints?.IsAfterStartDate).toBe('End date must be after start date');
  });

  it('should pass validation when end date is after start date', async () => {
    const dto = new CreateEventDto();
    dto.name = 'Test Event';
    dto.description = 'Test description';
    dto.type = EventType.InPerson;
    dto.status = EventStatus.Published;
    dto.visibility = EventVisibility.Public;
    dto.timeZone = 'America/Vancouver';
    dto.startDate = '2025-11-13T02:00:00.000Z' as unknown as Date; // 6pm PST
    dto.endDate = '2025-11-13T05:00:00.000Z' as unknown as Date;   // 9pm PST

    const errors = await validate(dto);
    const endDateError = errors.find((e) => e.property === 'endDate');

    expect(endDateError).toBeUndefined();
  });

  it('should pass validation when end date is not provided', async () => {
    const dto = new CreateEventDto();
    dto.name = 'Test Event';
    dto.description = 'Test description';
    dto.type = EventType.InPerson;
    dto.status = EventStatus.Published;
    dto.visibility = EventVisibility.Public;
    dto.timeZone = 'America/Vancouver';
    dto.startDate = '2025-11-13T02:00:00.000Z' as unknown as Date;
    // No endDate

    const errors = await validate(dto);
    const endDateError = errors.find((e) => e.property === 'endDate');

    expect(endDateError).toBeUndefined();
  });

  it('should reproduce the bug scenario with -10 hour duration', async () => {
    // This is the actual corrupted data from the database
    const dto = new CreateEventDto();
    dto.name = 'CRMC Monthly Meeting';
    dto.description = 'Test';
    dto.type = EventType.InPerson;
    dto.status = EventStatus.Published;
    dto.visibility = EventVisibility.Public;
    dto.timeZone = 'America/Vancouver';
    dto.startDate = '2025-11-13T03:00:00.000Z' as unknown as Date;
    dto.endDate = '2025-11-12T17:00:00.000Z' as unknown as Date;

    const errors = await validate(dto);
    const endDateError = errors.find((e) => e.property === 'endDate');

    // This should now be caught by validation
    expect(endDateError).toBeDefined();
    expect(endDateError?.constraints).toHaveProperty('IsAfterStartDate');

    // Calculate the duration to verify it's negative
    const startMs = new Date(dto.startDate).getTime();
    const endMs = new Date(dto.endDate).getTime();
    const durationHours = (endMs - startMs) / (1000 * 60 * 60);

    expect(durationHours).toBe(-10); // Confirms the bug scenario
  });
});
