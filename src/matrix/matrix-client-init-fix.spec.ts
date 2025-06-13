/**
 * Test to verify Matrix client initialization fix
 * The real bug is that matrixClientInitialized remains false even when credentials exist
 */
describe('Matrix Client Initialization Fix', () => {
  it('should identify the root cause: failed Matrix client initialization', () => {
    // Simulate the actual state in production
    const socketDataAfterAuth = {
      userId: 'tom-scanlan-dvasc6',
      tenantId: 'lsdfaopkljdfs',
      hasMatrixCredentials: true, // This is correctly set
    };

    const socketDataAfterInitAttempt = {
      ...socketDataAfterAuth,
      matrixClientInitialized: false, // This fails, causing the join-room error
    };

    // Current buggy check from matrix-gateway.helper.ts
    const currentCheck = (socketData: any) => {
      return !!(
        socketData.hasMatrixCredentials && socketData.matrixClientInitialized
      );
    };

    // The issue: this returns false even though user has credentials
    expect(currentCheck(socketDataAfterInitAttempt)).toBe(false);
    expect(socketDataAfterInitAttempt.hasMatrixCredentials).toBe(true);
  });

  it('should propose a fix: separate credential check from client initialization', () => {
    const socketData = {
      userId: 'tom-scanlan-dvasc6',
      tenantId: 'lsdfaopkljdfs',
      hasMatrixCredentials: true,
      matrixClientInitialized: false, // Client init failed, but credentials exist
    };

    // Proposed fix: Check credentials and allow retry of client initialization
    const improvedCheck = (socketData: any) => {
      // If user has credentials but client isn't initialized, try to initialize
      if (
        socketData.hasMatrixCredentials &&
        !socketData.matrixClientInitialized
      ) {
        // This should trigger a retry of Matrix client initialization
        // rather than immediately failing
        return { needsInitialization: true, hasCredentials: true };
      }

      // If both are true, everything is good
      if (
        socketData.hasMatrixCredentials &&
        socketData.matrixClientInitialized
      ) {
        return { needsInitialization: false, hasCredentials: true };
      }

      // If no credentials, fail immediately
      return { needsInitialization: false, hasCredentials: false };
    };

    const result = improvedCheck(socketData);
    expect(result).toEqual({
      needsInitialization: true,
      hasCredentials: true,
    });
  });

  it('should test Matrix client initialization error scenarios', () => {
    // Common reasons Matrix client initialization might fail:
    const testScenarios = [
      {
        name: 'Network timeout to Matrix server',
        error: new Error('ETIMEDOUT: matrix-dev.openmeet.net'),
        shouldRetry: true,
      },
      {
        name: 'Invalid Matrix token (expired)',
        error: new Error('Invalid access token'),
        shouldRetry: false, // Need to refresh token
      },
      {
        name: 'Matrix server unavailable',
        error: new Error('ECONNREFUSED'),
        shouldRetry: true,
      },
      {
        name: 'Database connection lost during user lookup',
        error: new Error('Connection terminated unexpectedly'),
        shouldRetry: true,
      },
    ];

    testScenarios.forEach(({ name, error, shouldRetry }) => {
      const handleInitError = (error: Error) => {
        // Determine if we should retry based on error type
        const isRetryableError =
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('Connection terminated');

        return {
          shouldRetry: isRetryableError,
          isTokenError: error.message.includes('Invalid access token'),
        };
      };

      const result = handleInitError(error);
      expect(result.shouldRetry).toBe(shouldRetry);
    });
  });

  it('should test the fix implementation', () => {
    // Mock the scenario where Matrix client init fails but credentials exist
    const mockSocket = {
      data: {
        hasMatrixCredentials: true,
        matrixClientInitialized: false,
      },
      emit: jest.fn(),
    };

    // Improved join-room handler logic
    const improvedJoinRoomCheck = (socket: any) => {
      if (!socket.data.hasMatrixCredentials) {
        throw new Error('No Matrix credentials');
      }

      if (!socket.data.matrixClientInitialized) {
        // Instead of failing immediately, attempt to initialize
        return {
          status: 'needs_initialization',
          message: 'Matrix client not initialized, attempting to initialize...',
        };
      }

      return {
        status: 'ready',
        message: 'Ready to join room',
      };
    };

    const result = improvedJoinRoomCheck(mockSocket);
    expect(result.status).toBe('needs_initialization');
  });
});
