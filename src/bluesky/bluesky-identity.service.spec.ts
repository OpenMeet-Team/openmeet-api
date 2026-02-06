import { Test, TestingModule } from '@nestjs/testing';
import { BlueskyIdentityService } from './bluesky-identity.service';
import { ConfigService } from '@nestjs/config';

// Mock @atproto/identity module
const mockResolveNoCheck = jest.fn();
const mockHandleResolve = jest.fn();
const mockGetPds = jest.fn();
const mockGetHandle = jest.fn();
const mockIdResolverInstance = {
  did: { resolveNoCheck: mockResolveNoCheck },
  handle: { resolve: mockHandleResolve },
};
let idResolverCallCount = 0;
let idResolverConstructorArgs: any[] = [];

jest.mock('@atproto/identity', () => ({
  IdResolver: jest.fn().mockImplementation((...args: any[]) => {
    idResolverConstructorArgs.push(args[0]);
    idResolverCallCount++;
    return mockIdResolverInstance;
  }),
  getPds: (...args: any[]) => mockGetPds(...args),
  getHandle: (...args: any[]) => mockGetHandle(...args),
}));

// Mock @atproto/api
const mockGetProfile = jest.fn();
jest.mock('@atproto/api', () => ({
  Agent: jest.fn().mockImplementation(() => ({
    getProfile: mockGetProfile,
  })),
}));

// Mock @opentelemetry/api
const mockSpan = {
  setAttribute: jest.fn(),
  setStatus: jest.fn(),
  end: jest.fn(),
};
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startActiveSpan: (_name: string, fn: (span: any) => any) => fn(mockSpan),
    }),
  },
  SpanStatusCode: { ERROR: 2 },
}));

describe('BlueskyIdentityService', () => {
  let service: BlueskyIdentityService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    idResolverCallCount = 0;
    idResolverConstructorArgs = [];

    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlueskyIdentityService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<BlueskyIdentityService>(BlueskyIdentityService);
  });

  describe('resolveProfile', () => {
    const mockDidDoc = { id: 'did:plc:test123' };

    beforeEach(() => {
      mockResolveNoCheck.mockResolvedValue(mockDidDoc);
      mockGetPds.mockReturnValue('https://pds.example.com');
      mockGetHandle.mockReturnValue('test.bsky.social');
      mockGetProfile.mockResolvedValue({
        data: {
          did: 'did:plc:test123',
          handle: 'test.bsky.social',
          displayName: 'Test User',
          avatar: 'https://cdn.bsky.app/img/avatar/test.jpg',
          followersCount: 10,
          followingCount: 5,
          postsCount: 20,
          description: 'Test description',
          indexedAt: '2025-01-01T00:00:00Z',
          labels: [],
        },
      });
    });

    it('should use default IdResolver when DID_PLC_URL is not set', async () => {
      // Arrange: No DID_PLC_URL configured
      mockConfigService.get.mockReturnValue(undefined);

      // Act
      await service.resolveProfile('did:plc:test123');

      // Assert: IdResolver should be created with empty options (no plcUrl)
      expect(idResolverConstructorArgs[0]).toEqual({});
    });

    it('should pass DID_PLC_URL to IdResolver when configured', async () => {
      // Arrange: Private PLC is configured
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'DID_PLC_URL') return 'https://plc.dev.opnmt.me';
        return undefined;
      });

      // Act
      await service.resolveProfile('did:plc:test123');

      // Assert: IdResolver should be created with plcUrl option
      expect(idResolverConstructorArgs[0]).toEqual({
        plcUrl: 'https://plc.dev.opnmt.me',
      });
    });

    it('should fallback to public PLC when DID not found on private PLC', async () => {
      // Arrange: Private PLC is configured, first resolve returns null (not found)
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'DID_PLC_URL') return 'https://plc.dev.opnmt.me';
        return undefined;
      });

      // First call (private PLC) returns null, second call (public) returns doc
      mockResolveNoCheck
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockDidDoc);

      // Act
      await service.resolveProfile('did:plc:test123');

      // Assert: Should have created two IdResolvers - one private, one public
      expect(idResolverCallCount).toBeGreaterThanOrEqual(2);
      // First call with private PLC
      expect(idResolverConstructorArgs[0]).toEqual({
        plcUrl: 'https://plc.dev.opnmt.me',
      });
      // Second call should be without plcUrl (public fallback)
      expect(idResolverConstructorArgs[1]).toBeUndefined();
    });

    it('should not fallback to public PLC when DID is found on private PLC', async () => {
      // Arrange: Private PLC is configured and DID is found
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'DID_PLC_URL') return 'https://plc.dev.opnmt.me';
        return undefined;
      });

      mockResolveNoCheck.mockResolvedValue(mockDidDoc);

      // Act
      await service.resolveProfile('did:plc:test123');

      // Assert: Only one IdResolver should have been created (no fallback needed)
      expect(idResolverCallCount).toBe(1);
    });

    it('should throw when DID not found on either private or public PLC', async () => {
      // Arrange: Private PLC configured, DID not found anywhere
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'DID_PLC_URL') return 'https://plc.dev.opnmt.me';
        return undefined;
      });

      mockResolveNoCheck.mockResolvedValue(null);

      // Act & Assert
      await expect(service.resolveProfile('did:plc:test123')).rejects.toThrow(
        /Unable to resolve profile/,
      );
    });
  });
});
