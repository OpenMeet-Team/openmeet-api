/**
 * Debugging test to investigate WebSocket authentication failures
 * This test simulates the exact production scenario
 */
describe('Matrix WebSocket Auth Debug', () => {
  it('should check database query behavior for Matrix credentials', () => {
    // Simulate the exact user data from production
    const realProductionUser = {
      slug: 'tom-scanlan-dvasc6',
      matrixUserId: '@tom-scanlan-dvasc6_lsdfaopkljdfs:matrix.openmeet.net',
      matrixAccessToken:
        'syt_valid_75_character_token_here_with_proper_content_that_is_exactly_75_chars',
      matrixDeviceId: 'OPENMEET_SERVER',
    };

    // Test current logic
    const hasCredentialsCurrent = !!(
      realProductionUser.matrixUserId &&
      realProductionUser.matrixAccessToken &&
      realProductionUser.matrixDeviceId
    );

    // Test with trim logic
    const hasCredentialsWithTrim = !!(
      realProductionUser.matrixUserId?.trim() &&
      realProductionUser.matrixAccessToken?.trim() &&
      realProductionUser.matrixDeviceId?.trim()
    );

    expect(hasCredentialsCurrent).toBe(true);
    expect(hasCredentialsWithTrim).toBe(true);
  });

  it('should test potential database field selection issues', () => {
    // Test what happens if some fields are not selected in the database query
    const userFromDatabaseWithMissingFields = {
      slug: 'tom-scanlan-dvasc6',
      matrixUserId: '@tom-scanlan-dvasc6_lsdfaopkljdfs:matrix.openmeet.net',
      // matrixAccessToken is missing from query result
      matrixDeviceId: 'OPENMEET_SERVER',
    };

    const hasCredentials = !!(
      userFromDatabaseWithMissingFields.matrixUserId?.trim() &&
      userFromDatabaseWithMissingFields.matrixAccessToken?.trim() &&
      userFromDatabaseWithMissingFields.matrixDeviceId?.trim()
    );

    expect(hasCredentials).toBe(false); // This would cause the bug!
  });

  it('should test tenant ID resolution issues', () => {
    // Test if tenant ID mismatch could cause user lookup to fail
    const scenarios = [
      {
        name: 'Correct tenant ID',
        userResult: {
          slug: 'tom-scanlan-dvasc6',
          tenantId: 'lsdfaopkljdfs',
          matrixUserId: '@tom-scanlan-dvasc6_lsdfaopkljdfs:matrix.openmeet.net',
          matrixAccessToken: 'valid_token',
          matrixDeviceId: 'OPENMEET_SERVER',
        },
        expectedHasCredentials: true,
      },
      {
        name: 'Wrong tenant ID - user not found',
        userResult: null, // User not found in wrong tenant
        expectedHasCredentials: false,
      },
      {
        name: 'User found but no Matrix credentials',
        userResult: {
          slug: 'tom-scanlan-dvasc6',
          tenantId: 'lsdfaopkljdfs',
          matrixUserId: null,
          matrixAccessToken: null,
          matrixDeviceId: null,
        },
        expectedHasCredentials: false,
      },
    ];

    scenarios.forEach(({ userResult, expectedHasCredentials }) => {
      const hasCredentials = userResult
        ? !!(
            userResult.matrixUserId?.trim() &&
            userResult.matrixAccessToken?.trim() &&
            userResult.matrixDeviceId?.trim()
          )
        : false;

      expect(hasCredentials).toBe(expectedHasCredentials);
    });
  });

  it('should test JWT parsing and user lookup chain', () => {
    // Test the full chain from JWT to user lookup
    const jwtPayload = {
      sub: 'tom-scanlan-dvasc6', // This should be the user slug
      tenantId: 'lsdfaopkljdfs',
    };

    // Mock successful user lookup
    const mockUserService = {
      findByIdWithTenant: jest.fn(),
    };

    const realUser = {
      slug: 'tom-scanlan-dvasc6',
      tenantId: 'lsdfaopkljdfs',
      matrixUserId: '@tom-scanlan-dvasc6_lsdfaopkljdfs:matrix.openmeet.net',
      matrixAccessToken: 'valid_token',
      matrixDeviceId: 'OPENMEET_SERVER',
    };

    mockUserService.findByIdWithTenant.mockResolvedValue(realUser);

    // Simulate the authentication flow
    const authenticateUser = async () => {
      const user = await mockUserService.findByIdWithTenant(
        jwtPayload.sub,
        jwtPayload.tenantId,
      );

      if (!user) {
        return { authenticated: false, reason: 'user_not_found' };
      }

      const hasMatrixCredentials = !!(
        user.matrixUserId?.trim() &&
        user.matrixAccessToken?.trim() &&
        user.matrixDeviceId?.trim()
      );

      return {
        authenticated: true,
        hasMatrixCredentials,
        userId: user.slug,
        tenantId: user.tenantId,
      };
    };

    // Test the flow
    void expect(authenticateUser()).resolves.toEqual({
      authenticated: true,
      hasMatrixCredentials: true,
      userId: 'tom-scanlan-dvasc6',
      tenantId: 'lsdfaopkljdfs',
    });
  });

  it('should identify potential race conditions in socket data', () => {
    // Test if socket.data could be modified between auth and usage
    const mockSocket = {
      id: 'test-socket',
      data: {
        userId: 'tom-scanlan-dvasc6',
        tenantId: 'lsdfaopkljdfs',
        hasMatrixCredentials: true,
        matrixClientInitialized: false, // This might be the issue!
      },
    };

    // Test the actual check from matrix-gateway.helper.ts
    const checkMatrixCredentials = (client: any) => {
      if (
        !client.data?.hasMatrixCredentials ||
        !client.data?.matrixClientInitialized
      ) {
        return false;
      }
      return true;
    };

    // This would fail because matrixClientInitialized is false
    expect(checkMatrixCredentials(mockSocket)).toBe(false);

    // But if we only check hasMatrixCredentials, it would pass
    expect(mockSocket.data.hasMatrixCredentials).toBe(true);
  });
});
