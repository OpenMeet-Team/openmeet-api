import {
  mergeArrayField,
  isLegacyOpenMeetEntry,
} from './atproto-record-merge.utils';

describe('mergeArrayField', () => {
  it('should preserve entries from other apps', () => {
    const pdsArray = [
      { uri: 'https://conf.example.com/talk-42', name: 'Schedule' },
    ];
    const openMeetEntries = [
      {
        uri: 'https://platform.openmeet.net/events/foo',
        name: 'OpenMeet Event',
        source: 'openmeet',
      },
    ];
    const result = mergeArrayField(pdsArray, openMeetEntries);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(pdsArray[0]);
    expect(result[1]).toEqual(openMeetEntries[0]);
  });

  it('should replace old OpenMeet entries with new ones', () => {
    const pdsArray = [
      {
        uri: 'https://old-cdn.openmeet.net/old.jpg',
        name: 'Event Image',
        source: 'openmeet',
      },
      { uri: 'https://conf.example.com/talk-42', name: 'Schedule' },
    ];
    const openMeetEntries = [
      {
        uri: 'https://cdn.openmeet.net/new.jpg',
        name: 'Event Image',
        source: 'openmeet',
      },
    ];
    const result = mergeArrayField(pdsArray, openMeetEntries);
    expect(result).toHaveLength(2);
    expect(result[0].uri).toBe('https://conf.example.com/talk-42');
    expect(result[1].uri).toBe('https://cdn.openmeet.net/new.jpg');
  });

  it('should remove OpenMeet entries when none provided', () => {
    const pdsArray = [
      {
        uri: 'https://cdn.openmeet.net/img.jpg',
        name: 'Event Image',
        source: 'openmeet',
      },
      { uri: 'https://conf.example.com/talk-42', name: 'Schedule' },
    ];
    const result = mergeArrayField(pdsArray, []);
    expect(result).toHaveLength(1);
    expect(result[0].uri).toBe('https://conf.example.com/talk-42');
  });

  it('should handle undefined pds array', () => {
    const openMeetEntries = [
      {
        uri: 'https://platform.openmeet.net/events/foo',
        name: 'OpenMeet Event',
        source: 'openmeet',
      },
    ];
    const result = mergeArrayField(undefined, openMeetEntries);
    expect(result).toHaveLength(1);
  });

  it('should handle empty arrays', () => {
    const result = mergeArrayField([], []);
    expect(result).toEqual([]);
  });
});

describe('isLegacyOpenMeetEntry', () => {
  it('should identify OpenMeet Event link', () => {
    expect(
      isLegacyOpenMeetEntry({
        name: 'OpenMeet Event',
        uri: 'https://platform.openmeet.net/events/foo',
      }),
    ).toBe(true);
  });

  it('should identify CDN image by cloudfront domain + OpenMeet name', () => {
    expect(
      isLegacyOpenMeetEntry({
        uri: 'https://d1234.cloudfront.net/uploads/img.jpg',
        name: 'Event Image',
      }),
    ).toBe(true);
    expect(
      isLegacyOpenMeetEntry({
        uri: 'https://d1234.cloudfront.net/uploads/link',
        name: 'Online Meeting Link',
      }),
    ).toBe(true);
  });

  it('should NOT match third-party CloudFront URLs', () => {
    expect(
      isLegacyOpenMeetEntry({
        uri: 'https://d9999.cloudfront.net/some-asset.jpg',
        name: 'Conference Photo',
      }),
    ).toBe(false);
  });

  it('should identify openmeet.net URLs', () => {
    expect(
      isLegacyOpenMeetEntry({
        uri: 'https://platform.openmeet.net/events/my-event',
        name: 'Link',
      }),
    ).toBe(true);
  });

  it('should not match external URLs', () => {
    expect(
      isLegacyOpenMeetEntry({
        uri: 'https://conf.example.com/talk-42',
        name: 'Schedule',
      }),
    ).toBe(false);
  });

  it('should handle null, undefined, and missing uri gracefully', () => {
    expect(isLegacyOpenMeetEntry(null)).toBe(false);
    expect(isLegacyOpenMeetEntry(undefined)).toBe(false);
    expect(isLegacyOpenMeetEntry({ name: 'foo' })).toBe(false);
    expect(isLegacyOpenMeetEntry({})).toBe(false);
  });
});

describe('stripNullish + spread invariant', () => {
  // Inline stripNullish for testing the invariant directly
  function stripNullish(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== null && v !== undefined),
    );
  }

  it('should remove stale base value when OpenMeet field is undefined', () => {
    const base = { endsAt: '2026-04-01T00:00:00Z', speakers: ['Alice'] };
    const result = stripNullish({
      ...base,
      endsAt: undefined,
    });
    expect(result).not.toHaveProperty('endsAt');
    expect(result.speakers).toEqual(['Alice']);
  });

  it('should remove stale base value when OpenMeet field is null', () => {
    const base = { description: 'Old desc', talkType: 'keynote' };
    const result = stripNullish({
      ...base,
      description: null,
    });
    expect(result).not.toHaveProperty('description');
    expect(result.talkType).toBe('keynote');
  });

  it('should overwrite base value with OpenMeet value', () => {
    const base = { name: 'Old Name', speakers: ['Alice'] };
    const result = stripNullish({
      ...base,
      name: 'New Name',
    });
    expect(result.name).toBe('New Name');
    expect(result.speakers).toEqual(['Alice']);
  });

  it('should preserve unknown fields from base', () => {
    const base = {
      speakers: ['Alice'],
      talkType: 'keynote',
      category: 'tech',
    };
    const result = stripNullish({
      ...base,
      name: 'My Event',
      startsAt: '2026-06-01T10:00:00Z',
    });
    expect(result.speakers).toEqual(['Alice']);
    expect(result.talkType).toBe('keynote');
    expect(result.category).toBe('tech');
    expect(result.name).toBe('My Event');
  });

  it('should handle empty base (first publish)', () => {
    const result = stripNullish({
      ...{},
      name: 'New Event',
      endsAt: undefined,
    });
    expect(result.name).toBe('New Event');
    expect(result).not.toHaveProperty('endsAt');
  });

  it('should handle undefined spread (atprotoRecord is null)', () => {
    const base = undefined as any;
    const result = stripNullish({
      ...base,
      name: 'New Event',
    });
    expect(result.name).toBe('New Event');
  });

  it('should preserve createdAt from base on update', () => {
    const base = { createdAt: '2026-01-01T00:00:00Z' };
    const result = stripNullish({
      ...base,
      name: 'Updated Event',
      createdAt: base.createdAt,
    });
    expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
  });
});
