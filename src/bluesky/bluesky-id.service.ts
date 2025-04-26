import { Injectable } from '@nestjs/common';

/**
 * Service for handling Bluesky AT Protocol URI operations
 * This service provides methods for creating, parsing, and validating AT Protocol URIs
 * Format: at://{did}/{collection}/{rkey}
 */
@Injectable()
export class BlueskyIdService {
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

    return `at://${did}/${collection}/${rkey}`;
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

    return {
      did,
      collection,
      rkey,
    };
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
