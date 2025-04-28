import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlueskyConfig } from '../auth-bluesky/config/bluesky-config.type';
import { BLUESKY_COLLECTIONS } from './BlueskyTypes';

/**
 * Service for handling Bluesky AT Protocol URI operations
 * This service provides methods for creating, parsing, and validating AT Protocol URIs
 * Format: at://{did}/{collection}/{rkey}
 */
@Injectable()
export class BlueskyIdService {
  private readonly collectionSuffix: string;

  constructor(private readonly configService: ConfigService) {
    // Read the collection suffix from configuration
    this.collectionSuffix =
      this.configService.get<BlueskyConfig>('bluesky')?.collectionSuffix || '';
  }
  /**
   * Creates a full AT Protocol URI from its components
   * @param did - The decentralized identifier
   * @param collection - The collection name
   * @param rkey - The record key
   * @returns The complete AT Protocol URI
   */
  createUri(did: string, collection: string, rkey: string): string {
    // Validate input components
    this.validateDid(did);
    this.validateCollection(collection);
    this.validateRkey(rkey);

    // Apply collection suffix if available - handle base collections for events and RSVPs
    const finalCollection = this.applyCollectionSuffix(collection);

    return `at://${did}/${finalCollection}/${rkey}`;
  }

  /**
   * Applies the collection suffix to the standard collection name
   * @param collection - The base collection name
   * @returns The collection name with suffix if applicable
   */
  applyCollectionSuffix(collection: string): string {
    if (!this.collectionSuffix) {
      return collection;
    }

    // Only apply suffix to our calendar collections
    if (
      collection === BLUESKY_COLLECTIONS.EVENT ||
      collection === BLUESKY_COLLECTIONS.RSVP
    ) {
      return `${collection}${this.collectionSuffix}`;
    }

    return collection;
  }

  /**
   * Parses a full AT Protocol URI into its component parts
   * @param uri - The complete AT Protocol URI to parse
   * @returns An object containing the parsed did, collection, and rkey
   * @throws Error if the URI is invalid or cannot be parsed
   */
  parseUri(uri: string): { did: string; collection: string; rkey: string } {
    if (typeof uri !== 'string' || !uri.startsWith('at://')) {
      throw new Error(`Invalid AT Protocol URI format: ${uri}`);
    }

    // Remove 'at://' prefix and split by '/'
    const parts = uri.substring(5).split('/');

    if (parts.length !== 3) {
      throw new Error(`Invalid AT Protocol URI structure: ${uri}`);
    }

    const [did, collection, rkey] = parts;

    // Normalize collection name by removing any suffix for internal usage
    const normalizedCollection = this.normalizeCollection(collection);

    return {
      did,
      collection: normalizedCollection,
      rkey,
    };
  }

  /**
   * Normalizes a collection name by removing any environment suffix
   * Used when parsing URIs to ensure consistent collection names internally
   * @param collection - The collection name with possible suffix
   * @returns The normalized collection name without suffix
   */
  normalizeCollection(collection: string): string {
    if (!this.collectionSuffix) {
      return collection;
    }

    // Remove suffix from event and RSVP collections if present
    if (collection.endsWith(this.collectionSuffix)) {
      // Check if it's one of our known collections with a suffix
      if (
        collection === `${BLUESKY_COLLECTIONS.EVENT}${this.collectionSuffix}`
      ) {
        return BLUESKY_COLLECTIONS.EVENT;
      }
      if (
        collection === `${BLUESKY_COLLECTIONS.RSVP}${this.collectionSuffix}`
      ) {
        return BLUESKY_COLLECTIONS.RSVP;
      }
    }

    return collection;
  }

  /**
   * Validates if a string is a properly formatted AT Protocol URI
   * @param uri - The URI to validate
   * @returns True if the URI is valid, false otherwise
   */
  isValidUri(uri: string): boolean {
    if (!uri || typeof uri !== 'string') {
      return false;
    }

    // Basic format validation with regex
    const atUriRegex = /^at:\/\/[^\/]+\/[^\/]+\/[^\/]+$/;
    if (!atUriRegex.test(uri)) {
      return false;
    }

    try {
      // Parse the URI components
      const parts = uri.substring(5).split('/');
      if (parts.length !== 3) {
        return false;
      }

      const [did, collection, rkey] = parts;

      // Use our defined validation functions
      return (
        this.isValidDid(did) &&
        this.isValidCollection(collection) &&
        this.isValidRkey(rkey)
      );
    } catch (e) {
      console.error(`Error validating AT Protocol URI: ${uri} ${e.e}`, e.stack);
      return false;
    }
  }

  /**
   * Validates if a string is a properly formatted DID
   * @param did - The DID to validate
   * @returns True if the DID is valid, false otherwise
   */
  private isValidDid(did: string): boolean {
    // Basic DID validation - should start with 'did:' followed by method (plc, web, key) and identifier
    // We're being more strict in validation than in parsing to catch potential issues
    return /^did:(plc|web|key):[a-zA-Z0-9.%-]+$/.test(did);
  }

  /**
   * Validates if a string is a properly formatted collection name
   * @param collection - The collection name to validate
   * @returns True if the collection name is valid, false otherwise
   */
  private isValidCollection(collection: string): boolean {
    // Collections should be alphanumeric with possible hyphens and dots
    // Must not contain exclamation marks, slashes, or other special characters
    // Also allow our suffix pattern (e.g., ".dev")
    const normalizedCollection = this.normalizeCollection(collection);
    return (
      /^[a-zA-Z][a-zA-Z0-9.-]*$/.test(collection) && !collection.includes('/')
    );
  }

  /**
   * Validates if a string is a properly formatted record key
   * @param rkey - The record key to validate
   * @returns True if the record key is valid, false otherwise
   */
  private isValidRkey(rkey: string): boolean {
    // Record keys are typically alphanumeric strings, sometimes with hyphens
    // Must not contain special characters like @ or slashes
    return (
      /^[a-zA-Z0-9-]+$/.test(rkey) && !rkey.includes('/') && !rkey.includes('@')
    );
  }

  /**
   * Validates a DID and throws an error if invalid
   * @param did - The DID to validate
   * @throws Error if the DID is invalid
   */
  private validateDid(did: string): void {
    if (!this.isValidDid(did)) {
      throw new Error(`Invalid DID format: ${did}`);
    }
  }

  /**
   * Validates a collection name and throws an error if invalid
   * @param collection - The collection name to validate
   * @throws Error if the collection name is invalid
   */
  private validateCollection(collection: string): void {
    if (!this.isValidCollection(collection)) {
      throw new Error(`Invalid collection format: ${collection}`);
    }
  }

  /**
   * Validates a record key and throws an error if invalid
   * @param rkey - The record key to validate
   * @throws Error if the record key is invalid
   */
  private validateRkey(rkey: string): void {
    if (!this.isValidRkey(rkey)) {
      throw new Error(`Invalid record key format: ${rkey}`);
    }
  }
}
