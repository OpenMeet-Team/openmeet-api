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

  it('should identify CDN image by domain pattern', () => {
    expect(
      isLegacyOpenMeetEntry({
        uri: 'https://d1234.cloudfront.net/uploads/img.jpg',
        name: 'Image',
      }),
    ).toBe(true);
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
});
