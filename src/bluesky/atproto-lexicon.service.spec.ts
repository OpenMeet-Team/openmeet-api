import { Test, TestingModule } from '@nestjs/testing';
import { AtprotoLexiconService } from './atproto-lexicon.service';

describe('AtprotoLexiconService', () => {
  let service: AtprotoLexiconService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AtprotoLexiconService],
    }).compile();

    service = module.get<AtprotoLexiconService>(AtprotoLexiconService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate', () => {
    describe('event records', () => {
      it('should pass validation for a valid event record', () => {
        const record = {
          $type: 'community.lexicon.calendar.event',
          name: 'Test Event',
          createdAt: '2024-01-01T00:00:00.000Z',
          startsAt: '2024-02-01T10:00:00.000Z',
          endsAt: '2024-02-01T12:00:00.000Z',
          mode: 'community.lexicon.calendar.event#inperson',
          status: 'community.lexicon.calendar.event#scheduled',
          locations: [],
          uris: [],
        };

        const result = service.validate(
          'community.lexicon.calendar.event',
          record,
        );
        expect(result.success).toBe(true);
      });

      it('should fail validation when required field "name" is missing', () => {
        const record = {
          $type: 'community.lexicon.calendar.event',
          createdAt: '2024-01-01T00:00:00.000Z',
          startsAt: '2024-02-01T10:00:00.000Z',
        };

        const result = service.validate(
          'community.lexicon.calendar.event',
          record,
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('name');
        }
      });

      it('should fail validation when required field "createdAt" is missing', () => {
        const record = {
          $type: 'community.lexicon.calendar.event',
          name: 'Test Event',
          startsAt: '2024-02-01T10:00:00.000Z',
        };

        const result = service.validate(
          'community.lexicon.calendar.event',
          record,
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('createdAt');
        }
      });

      it('should pass validation for event with geo location union member', () => {
        const record = {
          $type: 'community.lexicon.calendar.event',
          name: 'Location Event',
          createdAt: '2024-01-01T00:00:00.000Z',
          startsAt: '2024-02-01T10:00:00.000Z',
          mode: 'community.lexicon.calendar.event#inperson',
          status: 'community.lexicon.calendar.event#scheduled',
          locations: [
            {
              $type: 'community.lexicon.location.geo',
              latitude: '40.7128',
              longitude: '-74.0060',
              name: 'New York City',
            },
          ],
          uris: [],
        };

        const result = service.validate(
          'community.lexicon.calendar.event',
          record,
        );
        expect(result.success).toBe(true);
      });

      it('should pass validation for event with extra fields (openMeetMeta)', () => {
        const record = {
          $type: 'community.lexicon.calendar.event',
          name: 'Event with Meta',
          createdAt: '2024-01-01T00:00:00.000Z',
          startsAt: '2024-02-01T10:00:00.000Z',
          mode: 'community.lexicon.calendar.event#inperson',
          status: 'community.lexicon.calendar.event#scheduled',
          locations: [],
          uris: [],
          openMeetMeta: {
            seriesSlug: 'weekly-standup',
            isRecurring: true,
          },
        };

        const result = service.validate(
          'community.lexicon.calendar.event',
          record,
        );
        expect(result.success).toBe(true);
      });
    });

    describe('RSVP records', () => {
      const validCid =
        'bafyreih4gqyfkodywvijahyovq7tewbtkckjq56rrkhuruhkijksuqyfri';

      it('should pass validation for a valid RSVP record with CID', () => {
        const record = {
          $type: 'community.lexicon.calendar.rsvp',
          subject: {
            uri: 'at://did:plc:abc123/community.lexicon.calendar.event/tid123abcdefg',
            cid: validCid,
          },
          status: 'community.lexicon.calendar.rsvp#going',
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const result = service.validate(
          'community.lexicon.calendar.rsvp',
          record,
        );
        expect(result.success).toBe(true);
      });

      it('should fail validation when required field "subject" is missing', () => {
        const record = {
          $type: 'community.lexicon.calendar.rsvp',
          status: 'community.lexicon.calendar.rsvp#going',
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const result = service.validate(
          'community.lexicon.calendar.rsvp',
          record,
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('subject');
        }
      });

      it('should pass validation when "status" is missing (lexicon provides default value)', () => {
        const record = {
          $type: 'community.lexicon.calendar.rsvp',
          subject: {
            uri: 'at://did:plc:abc123/community.lexicon.calendar.event/tid123abcdefg',
            cid: validCid,
          },
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const result = service.validate(
          'community.lexicon.calendar.rsvp',
          record,
        );
        // The RSVP lexicon defines a default for status ("community.lexicon.calendar.rsvp#going"),
        // so when status is omitted the validator fills in the default and validation passes.
        expect(result.success).toBe(true);
      });

      it('should fail validation when RSVP subject is missing CID (strongRef requires both uri and cid)', () => {
        const record = {
          $type: 'community.lexicon.calendar.rsvp',
          subject: {
            uri: 'at://did:plc:abc123/community.lexicon.calendar.event/tid123abcdefg',
            // No CID - strongRef requires both uri and cid
          },
          status: 'community.lexicon.calendar.rsvp#going',
          createdAt: '2024-01-01T00:00:00.000Z',
        };

        const result = service.validate(
          'community.lexicon.calendar.rsvp',
          record,
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('cid');
        }
      });
    });
  });
});
