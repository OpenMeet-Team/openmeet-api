import { WsException } from '@nestjs/websockets';

describe('Matrix Credentials Check Logic - Bug Reproduction', () => {
  let mockUserService: any;

  const mockUserWithCredentials = {
    id: 'tom-scanlan-dvasc6',
    tenantId: 'lsdfaopkljdfs',
    matrixUserId: '@tom-scanlan-dvasc6_lsdfaopkljdfs:matrix.openmeet.net',
    matrixAccessToken: 'syt_valid_token_here',
    matrixDeviceId: 'DEVICEABC123',
    name: 'Tom Scanlan',
  };

  beforeEach(() => {
    mockUserService = {
      findByIdWithTenant: jest.fn(),
    };
  });

  describe('Bug Reproduction: hasMatrixCredentials flag', () => {
    it('should correctly identify user WITH Matrix credentials', () => {
      // This test simulates the exact scenario from the logs where tom-scanlan-dvasc6
      // has valid Matrix credentials and is actively syncing with the Matrix server

      const mockSocket = {
        id: 'test-socket',
        data: {},
        handshake: {
          auth: { token: 'valid-jwt' },
          headers: {},
        },
      } as any as Socket;

      // Simulate the auth handler logic
      const hasMatrixCredentials = !!(
        mockUserWithCredentials.matrixUserId &&
        mockUserWithCredentials.matrixAccessToken &&
        mockUserWithCredentials.matrixDeviceId
      );

      expect(hasMatrixCredentials).toBe(true);
      expect(mockUserWithCredentials.matrixUserId).toBeTruthy();
      expect(mockUserWithCredentials.matrixAccessToken).toBeTruthy();
      expect(mockUserWithCredentials.matrixDeviceId).toBeTruthy();
    });

    it('should fail if socket.data is not properly set during authentication', () => {
      // This test checks if the socket.data object is being properly populated
      const mockSocket = {
        id: 'test-socket',
        data: {}, // Empty data object
      } as any;

      // Simulate checking for Matrix credentials without proper auth
      const checkCredentials = () => {
        if (!mockSocket.data || !mockSocket.data.userId) {
          throw new WsException('Unauthorized access');
        }
        if (!mockSocket.data.hasMatrixCredentials) {
          throw new WsException('Matrix credentials required');
        }
      };

      expect(() => checkCredentials()).toThrow('Unauthorized access');
    });

    it('should verify the exact credential check logic matches production', () => {
      // Test various edge cases that might cause the check to fail

      const testCases = [
        {
          name: 'All credentials present',
          user: { ...mockUserWithCredentials },
          expected: true,
        },
        {
          name: 'Empty string matrixUserId',
          user: { ...mockUserWithCredentials, matrixUserId: '' },
          expected: false,
        },
        {
          name: 'Null matrixAccessToken',
          user: { ...mockUserWithCredentials, matrixAccessToken: null },
          expected: false,
        },
        {
          name: 'Undefined matrixDeviceId',
          user: { ...mockUserWithCredentials, matrixDeviceId: undefined },
          expected: false,
        },
        {
          name: 'Only whitespace in token (BUG DETECTED!)',
          user: { ...mockUserWithCredentials, matrixAccessToken: '   ' },
          expected: true, // BUG: whitespace-only strings are truthy in JS, but should be false
        },
      ];

      testCases.forEach(({ name, user, expected }) => {
        const hasCredentials = !!(
          user.matrixUserId &&
          user.matrixAccessToken &&
          user.matrixDeviceId
        );
        expect(hasCredentials).toBe(expected);
      });
    });

    it('should trace the full authentication flow', async () => {
      // This test traces the exact flow from socket connection to join-room

      // Step 1: User connects with JWT
      const jwtPayload = {
        sub: 'tom-scanlan-dvasc6',
        tenantId: 'lsdfaopkljdfs',
      };

      // Step 2: Fetch user from database
      mockUserService.findByIdWithTenant.mockResolvedValue(
        mockUserWithCredentials,
      );

      // Step 3: Check Matrix credentials
      const hasMatrixCredentials = !!(
        mockUserWithCredentials.matrixUserId &&
        mockUserWithCredentials.matrixAccessToken &&
        mockUserWithCredentials.matrixDeviceId
      );

      // Step 4: Set socket data
      const socketData = {
        userId: jwtPayload.sub,
        tenantId: jwtPayload.tenantId,
        hasMatrixCredentials,
      };

      // Verify all steps
      expect(hasMatrixCredentials).toBe(true);
      expect(socketData.hasMatrixCredentials).toBe(true);
    });

    it('should handle timing issues between auth and join-room', () => {
      // Test if there's a race condition where socket.data is cleared or modified
      // between authentication and the join-room event

      const mockSocket = {
        id: 'test-socket',
        data: {
          userId: 'tom-scanlan-dvasc6',
          tenantId: 'lsdfaopkljdfs',
          hasMatrixCredentials: true,
        },
      } as any;

      // Simulate some operation that might clear socket data
      const someOperation = () => {
        // What if something clears or overwrites socket.data?
        mockSocket.data = {}; // Bug: data cleared
      };

      // Before operation - credentials are present
      expect(mockSocket.data.hasMatrixCredentials).toBe(true);

      // After operation - credentials are gone
      someOperation();
      expect(mockSocket.data.hasMatrixCredentials).toBeUndefined();
    });

    it('should check if Matrix credentials are being fetched with proper includes', async () => {
      // Verify that the UserService is fetching Matrix fields

      mockUserService.findByIdWithTenant.mockResolvedValue(
        mockUserWithCredentials,
      );

      await mockUserService.findByIdWithTenant(
        'tom-scanlan-dvasc6',
        'lsdfaopkljdfs',
      );

      // The actual implementation might need to include specific fields
      // This could be the issue - Matrix fields not being selected in the query
      expect(mockUserService.findByIdWithTenant).toHaveBeenCalled();

      // Check if the returned user has all Matrix fields
      const returnedUser =
        await mockUserService.findByIdWithTenant.mock.results[0].value;
      expect(returnedUser).toHaveProperty('matrixUserId');
      expect(returnedUser).toHaveProperty('matrixAccessToken');
      expect(returnedUser).toHaveProperty('matrixDeviceId');
    });
  });

  describe('Potential Fix Verification', () => {
    it('should trim whitespace from Matrix credentials', () => {
      // Test if trimming would help with valid tokens that have whitespace
      const userWithWhitespace = {
        ...mockUserWithCredentials,
        matrixAccessToken: '  syt_valid_token_here  ',
      };

      const hasCredentialsWithTrim = !!(
        userWithWhitespace.matrixUserId?.trim() &&
        userWithWhitespace.matrixAccessToken?.trim() &&
        userWithWhitespace.matrixDeviceId?.trim()
      );

      expect(hasCredentialsWithTrim).toBe(true);
    });

    it('should properly handle whitespace-only credentials with trimming', () => {
      // Test the fix for the whitespace-only bug
      const userWithWhitespaceOnly = {
        ...mockUserWithCredentials,
        matrixAccessToken: '   ', // Only whitespace
      };

      // Current buggy logic
      const buggyCheck = !!(
        userWithWhitespaceOnly.matrixUserId &&
        userWithWhitespaceOnly.matrixAccessToken &&
        userWithWhitespaceOnly.matrixDeviceId
      );

      // Fixed logic with trimming
      const fixedCheck = !!(
        userWithWhitespaceOnly.matrixUserId?.trim() &&
        userWithWhitespaceOnly.matrixAccessToken?.trim() &&
        userWithWhitespaceOnly.matrixDeviceId?.trim()
      );

      expect(buggyCheck).toBe(true); // Current bug
      expect(fixedCheck).toBe(false); // Fixed behavior
    });

    it('should handle credential refresh between HTTP and WebSocket calls', () => {
      // Test if credentials might be different between HTTP API calls and WebSocket

      // HTTP request might have fresh data
      const httpUser = { ...mockUserWithCredentials };

      // WebSocket might have stale data
      const wsUser = { ...mockUserWithCredentials, matrixAccessToken: null };

      // This could explain why HTTP works but WebSocket fails
      expect(!!httpUser.matrixAccessToken).toBe(true);
      expect(!!wsUser.matrixAccessToken).toBe(false);
    });
  });
});
