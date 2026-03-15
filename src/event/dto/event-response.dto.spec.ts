import { EventResponseDto } from './event-response.dto';

describe('EventResponseDto', () => {
  it('should map origin field from partial', () => {
    const dto = new EventResponseDto({
      id: 1,
      name: 'Test',
      origin: 'group',
    });
    expect(dto.origin).toBe('group');
  });

  it('should map origin "external" from partial', () => {
    const dto = new EventResponseDto({
      id: 2,
      name: 'External Event',
      origin: 'external',
    });
    expect(dto.origin).toBe('external');
  });

  it('should leave origin undefined when not provided', () => {
    const dto = new EventResponseDto({
      id: 3,
      name: 'Regular Event',
    });
    expect(dto.origin).toBeUndefined();
  });
});
