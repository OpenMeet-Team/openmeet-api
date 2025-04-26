import { Test, TestingModule } from '@nestjs/testing';
import { BlueskyIdService } from './bluesky-id.service';

describe('BlueskyIdService', () => {
  let service: BlueskyIdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlueskyIdService],
    }).compile();

    service = module.get<BlueskyIdService>(BlueskyIdService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUri', () => {
    it('should create a valid URI from components', () => {
      const did = 'did:plc:abcdefg123456';
      const collection = 'app.bsky.feed.post';
      const rkey = '3jui2dwarf2xa';

      const uri = service.createUri(did, collection, rkey);

      expect(uri).toBe(`at://${did}/${collection}/${rkey}`);
    });

    it('should create a valid URI for different DID methods', () => {
      const testCases = [
        {
          did: 'did:plc:abcdefg123456',
          collection: 'app.bsky.feed.post',
          rkey: '3jui2dwarf2xa',
          expected:
            'at://did:plc:abcdefg123456/app.bsky.feed.post/3jui2dwarf2xa',
        },
        {
          did: 'did:web:example.com',
          collection: 'app.bsky.feed.post',
          rkey: '3jui2dwarf2xa',
          expected: 'at://did:web:example.com/app.bsky.feed.post/3jui2dwarf2xa',
        },
        {
          did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
          collection: 'app.bsky.feed.post',
          rkey: '3jui2dwarf2xa',
          expected:
            'at://did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK/app.bsky.feed.post/3jui2dwarf2xa',
        },
      ];

      for (const testCase of testCases) {
        const uri = service.createUri(
          testCase.did,
          testCase.collection,
          testCase.rkey,
        );
        expect(uri).toBe(testCase.expected);
      }
    });

    it('should create a valid URI for various collection types', () => {
      const did = 'did:plc:abcdefg123456';
      const rkey = '3jui2dwarf2xa';

      const collections = [
        'app.bsky.feed.post',
        'app.bsky.feed.like',
        'app.bsky.feed.repost',
        'app.bsky.graph.follow',
        'app.bsky.actor.profile',
        'app.bsky.feed.generator',
      ];

      for (const collection of collections) {
        const uri = service.createUri(did, collection, rkey);
        expect(uri).toBe(`at://${did}/${collection}/${rkey}`);
      }
    });

    it('should throw error when did is invalid', () => {
      const did = 'invalid-did';
      const collection = 'app.bsky.feed.post';
      const rkey = '3jui2dwarf2xa';

      expect(() => service.createUri(did, collection, rkey)).toThrow();
    });

    it('should throw error when collection is invalid', () => {
      const did = 'did:plc:abcdefg123456';
      const collection = 'invalid/collection';
      const rkey = '3jui2dwarf2xa';

      expect(() => service.createUri(did, collection, rkey)).toThrow();
    });

    it('should throw error when rkey is invalid', () => {
      const did = 'did:plc:abcdefg123456';
      const collection = 'app.bsky.feed.post';
      const rkey = 'invalid/rkey';

      expect(() => service.createUri(did, collection, rkey)).toThrow();
    });
  });

  describe('parseUri', () => {
    it('should correctly parse a valid URI', () => {
      const did = 'did:plc:abcdefg123456';
      const collection = 'app.bsky.feed.post';
      const rkey = '3jui2dwarf2xa';
      const uri = `at://${did}/${collection}/${rkey}`;

      const result = service.parseUri(uri);

      expect(result).toEqual({
        did,
        collection,
        rkey,
      });
    });

    it('should correctly parse URIs with different DID methods', () => {
      const testCases = [
        {
          uri: 'at://did:plc:abcdefg123456/app.bsky.feed.post/3jui2dwarf2xa',
          expected: {
            did: 'did:plc:abcdefg123456',
            collection: 'app.bsky.feed.post',
            rkey: '3jui2dwarf2xa',
          },
        },
        {
          uri: 'at://did:web:example.com/app.bsky.feed.post/3jui2dwarf2xa',
          expected: {
            did: 'did:web:example.com',
            collection: 'app.bsky.feed.post',
            rkey: '3jui2dwarf2xa',
          },
        },
        {
          uri: 'at://did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK/app.bsky.feed.post/3jui2dwarf2xa',
          expected: {
            did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            collection: 'app.bsky.feed.post',
            rkey: '3jui2dwarf2xa',
          },
        },
      ];

      for (const testCase of testCases) {
        const result = service.parseUri(testCase.uri);
        expect(result).toEqual(testCase.expected);
      }
    });

    it('should correctly parse URIs with different collection types', () => {
      const did = 'did:plc:abcdefg123456';
      const rkey = '3jui2dwarf2xa';

      const collections = [
        'app.bsky.feed.post',
        'app.bsky.feed.like',
        'app.bsky.feed.repost',
        'app.bsky.graph.follow',
        'app.bsky.actor.profile',
        'app.bsky.feed.generator',
      ];

      for (const collection of collections) {
        const uri = `at://${did}/${collection}/${rkey}`;
        const result = service.parseUri(uri);

        expect(result).toEqual({
          did,
          collection,
          rkey,
        });
      }
    });

    it('should throw error when URI is invalid', () => {
      expect(() => service.parseUri('invalid-uri')).toThrow();
      expect(() => service.parseUri('http://example.com')).toThrow();
      expect(() => service.parseUri('at://did/collection')).toThrow(); // Missing rkey
      expect(() =>
        service.parseUri('at://did/collection/rkey/extra'),
      ).toThrow(); // Extra segment
    });

    it('should throw specific error with useful message when URI format is wrong', () => {
      try {
        service.parseUri('invalid-uri');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Invalid AT Protocol URI format');
      }
    });
  });

  describe('isValidUri', () => {
    it('should return true for valid URIs', () => {
      const validUris = [
        'at://did:plc:abcdefg123456/app.bsky.feed.post/3jui2dwarf2xa',
        'at://did:web:example.com/app.bsky.feed.like/3jui2dwarf2xa',
        'at://did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK/app.bsky.feed.post/3jui2dwarf2xa',
        'at://did:plc:abcdefg123456/app.bsky.feed.generator/3jui2dwarf2xa',
        'at://did:plc:abcdefg123456/app.bsky.graph.follow/3jui2dwarf2xa',
        'at://did:plc:abcdefg123456/app.bsky.actor.profile/3jui2dwarf2xa',
      ];

      for (const uri of validUris) {
        expect(service.isValidUri(uri)).toBe(true);
      }
    });

    it('should return false for invalid URIs', () => {
      const invalidUris = [
        null,
        undefined,
        '',
        'invalid-uri',
        'http://example.com',
        'at://did/collection', // Missing rkey
        'at://did/collection/rkey/extra', // Extra segment
        'at://invalid-did/collection/rkey', // Invalid did
        'at://did:plc:abcdefg123456/invalid/collection/rkey', // Invalid collection
        'at://did:plc:abcdefg123456/app.bsky.feed.post/invalid/rkey', // Invalid rkey
      ];

      for (const uri of invalidUris) {
        expect(service.isValidUri(uri as any)).toBe(false);
      }
    });

    it('should correctly validate URIs with different DID method types', () => {
      // These should all be valid
      expect(
        service.isValidUri(
          'at://did:plc:abcdefg123456/app.bsky.feed.post/3jui2dwarf2xa',
        ),
      ).toBe(true);
      expect(
        service.isValidUri(
          'at://did:web:example.com/app.bsky.feed.post/3jui2dwarf2xa',
        ),
      ).toBe(true);
      expect(
        service.isValidUri(
          'at://did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK/app.bsky.feed.post/3jui2dwarf2xa',
        ),
      ).toBe(true);

      // These should be invalid
      expect(
        service.isValidUri(
          'at://did:invalid:abcdefg123456/app.bsky.feed.post/3jui2dwarf2xa',
        ),
      ).toBe(false);
      expect(
        service.isValidUri('at://notadid/app.bsky.feed.post/3jui2dwarf2xa'),
      ).toBe(false);
    });

    it('should correctly validate URIs with different collection types', () => {
      const did = 'did:plc:abcdefg123456';
      const rkey = '3jui2dwarf2xa';

      // Standard Bluesky collections - should all be valid
      expect(service.isValidUri(`at://${did}/app.bsky.feed.post/${rkey}`)).toBe(
        true,
      );
      expect(service.isValidUri(`at://${did}/app.bsky.feed.like/${rkey}`)).toBe(
        true,
      );
      expect(
        service.isValidUri(`at://${did}/app.bsky.feed.repost/${rkey}`),
      ).toBe(true);
      expect(
        service.isValidUri(`at://${did}/app.bsky.graph.follow/${rkey}`),
      ).toBe(true);
      expect(
        service.isValidUri(`at://${did}/app.bsky.actor.profile/${rkey}`),
      ).toBe(true);

      // Invalid collection formats
      expect(service.isValidUri(`at://${did}/invalid/collection/${rkey}`)).toBe(
        false,
      );
      expect(service.isValidUri(`at://${did}/invalidcollection!/${rkey}`)).toBe(
        false,
      );
    });

    it('should correctly validate URIs with different rkey formats', () => {
      const did = 'did:plc:abcdefg123456';
      const collection = 'app.bsky.feed.post';

      // Valid rkey formats
      expect(
        service.isValidUri(`at://${did}/${collection}/3jui2dwarf2xa`),
      ).toBe(true);
      expect(
        service.isValidUri(`at://${did}/${collection}/3JUI2DWARF2XA`),
      ).toBe(true);
      expect(
        service.isValidUri(`at://${did}/${collection}/3jui2-dwarf-2xa`),
      ).toBe(true);
      expect(service.isValidUri(`at://${did}/${collection}/123456789`)).toBe(
        true,
      );

      // Invalid rkey formats
      expect(service.isValidUri(`at://${did}/${collection}/invalid/rkey`)).toBe(
        false,
      );
      expect(service.isValidUri(`at://${did}/${collection}/invalid@rkey`)).toBe(
        false,
      );
    });
  });
});
