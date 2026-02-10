import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Lexicons, ValidationResult } from '@atproto/lexicon';
import { schemas as atprotoSchemas } from '@atproto/api/dist/client/lexicons';

// Import lexicon JSON files
import calendarEventLexicon from './lexicons/community.lexicon.calendar.event.json';
import calendarRsvpLexicon from './lexicons/community.lexicon.calendar.rsvp.json';
import locationGeoLexicon from './lexicons/community.lexicon.location.geo.json';
import locationAddressLexicon from './lexicons/community.lexicon.location.address.json';
import locationFsqLexicon from './lexicons/community.lexicon.location.fsq.json';
import locationHthreeLexicon from './lexicons/community.lexicon.location.hthree.json';

@Injectable()
export class AtprotoLexiconService implements OnModuleInit {
  private readonly logger = new Logger(AtprotoLexiconService.name);
  private lexicons: Lexicons;

  onModuleInit(): void {
    this.lexicons = new Lexicons();

    // Load com.atproto.repo.strongRef from @atproto/api's embedded lexicons
    // Required by the RSVP lexicon's subject field
    const strongRefSchema = atprotoSchemas.find(
      (s) => s.id === 'com.atproto.repo.strongRef',
    );
    if (strongRefSchema) {
      this.lexicons.add(strongRefSchema as any);
      this.logger.debug('Loaded com.atproto.repo.strongRef lexicon');
    } else {
      this.logger.warn(
        'Could not find com.atproto.repo.strongRef in @atproto/api schemas',
      );
    }

    // Load custom community lexicons
    const customLexicons = [
      calendarEventLexicon,
      calendarRsvpLexicon,
      locationGeoLexicon,
      locationAddressLexicon,
      locationFsqLexicon,
      locationHthreeLexicon,
    ];

    for (const lexicon of customLexicons) {
      this.lexicons.add(lexicon as any);
      this.logger.debug(`Loaded lexicon: ${lexicon.id}`);
    }

    this.logger.log(
      `Initialized AT Protocol lexicon validation with ${customLexicons.length + 1} schemas`,
    );
  }

  /**
   * Validate a record against its AT Protocol lexicon schema.
   *
   * @param collection - The NSID of the collection (e.g., 'community.lexicon.calendar.event')
   * @param record - The record data to validate
   * @returns ValidationResult from @atproto/lexicon
   */
  validate(collection: string, record: unknown): ValidationResult {
    const result = this.lexicons.validate(collection, record);

    if (!result.success) {
      this.logger.warn(
        `Lexicon validation failed for ${collection}: ${result.error.message}`,
      );
    }

    return result;
  }
}
