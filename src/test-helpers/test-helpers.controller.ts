import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { TestOnlyGuard } from '../shared/guard/test-only.guard';
import { AuthService } from '../auth/auth.service';
import { ShadowAccountService } from '../shadow-account/shadow-account.service';
import { AuthBlueskyService } from '../auth-bluesky/auth-bluesky.service';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { Public } from '../core/decorators/public.decorator';

/**
 * Test Helper Controller
 *
 * Provides endpoints for e2e testing that bypass OAuth flows and allow
 * direct creation of test data. These endpoints are:
 *
 * - Only available in test and development environments
 * - Blocked in production by TestOnlyGuard
 * - Excluded from Swagger documentation
 * - Not loaded in production (module excluded in AppModule)
 */
@Controller({
  path: 'test',
  version: '1',
})
@ApiExcludeController() // 🚫 Hidden from Swagger documentation
@UseGuards(TestOnlyGuard) // 🔒 Blocked in production
@Public() // Allow unauthenticated access for testing
export class TestHelpersController {
  constructor(
    private readonly authService: AuthService,
    private readonly shadowAccountService: ShadowAccountService,
    private readonly authBlueskyService: AuthBlueskyService,
  ) {}

  /**
   * Create a shadow account for testing
   *
   * POST /api/v1/test/shadow-accounts
   *
   * Creates a shadow Bluesky account that can be used in tests.
   *
   * @example
   * ```typescript
   * POST /api/v1/test/shadow-accounts
   * {
   *   "did": "did:plc:test123",
   *   "handle": "test.bsky.social",
   *   "displayName": "Test User"
   * }
   * ```
   */
  @Post('shadow-accounts')
  async createShadowAccount(
    @Body()
    body: {
      did: string;
      handle: string;
      displayName?: string;
      preferences?: Record<string, any>;
    },
    @Req() req,
  ) {
    const tenantId = req.tenantId;

    const shadowUser =
      await this.shadowAccountService.findOrCreateShadowAccount(
        body.did,
        body.displayName || body.handle,
        AuthProvidersEnum.bluesky,
        tenantId,
        body.preferences || {
          bluesky: {
            handle: body.handle,
            did: body.did,
            connected: false,
          },
        },
      );

    return {
      id: shadowUser.id,
      slug: shadowUser.slug,
      did: shadowUser.socialId,
      handle: body.handle,
      isShadowAccount: shadowUser.isShadowAccount,
      roleId: shadowUser.role?.id || null,
      provider: shadowUser.provider,
    };
  }

  /**
   * Simulate Bluesky OAuth login (bypassing actual OAuth)
   *
   * POST /api/v1/test/auth/bluesky
   *
   * Simulates a Bluesky login without going through the OAuth flow.
   * Useful for testing authentication logic and shadow account conversion.
   *
   * @example
   * ```typescript
   * POST /api/v1/test/auth/bluesky
   * {
   *   "did": "did:plc:test123",
   *   "handle": "test.bsky.social",
   *   "displayName": "Test User",
   *   "email": "test@example.com"
   * }
   * ```
   */
  @Post('auth/bluesky')
  async simulateBlueskyLogin(
    @Body()
    body: {
      did: string;
      handle: string;
      displayName?: string;
      email?: string;
    },
    @Req() req,
  ) {
    const tenantId = req.tenantId;

    // Directly call validateSocialLogin with mocked Bluesky data
    const loginResponse = await this.authService.validateSocialLogin(
      AuthProvidersEnum.bluesky,
      {
        id: body.did,
        email: body.email,
        firstName: body.displayName || body.handle,
        lastName: '',
      },
      tenantId,
    );

    // Return the full login response including user details
    return {
      token: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
      tokenExpires: loginResponse.tokenExpires,
      sessionId: loginResponse.sessionId,
      user: loginResponse.user,
    };
  }

  /**
   * Simulate Bluesky OAuth login via identity lookup (handleAuthCallback direct path)
   *
   * POST /api/v1/test/auth/bluesky-direct
   *
   * handleAuthCallback() has two branches:
   * 1. User found via AT Protocol identity lookup → loginExistingUser() (THIS endpoint)
   * 2. No identity match → validateSocialLogin/findOrCreateUser (POST /test/auth/bluesky)
   *
   * Both endpoints are needed because they exercise different production code paths.
   * This endpoint specifically tests the identity-lookup branch, which handles:
   * - Shadow account conversion (shadow → real with role assignment)
   * - Shadow account claiming (real user absorbing a duplicate shadow)
   * - Direct session creation (bypassing findOrCreateUser)
   *
   * For new users with no existing identity, falls back to validateSocialLogin().
   *
   * @example
   * ```typescript
   * POST /api/v1/test/auth/bluesky-direct
   * {
   *   "did": "did:plc:test123",
   *   "handle": "test.bsky.social",
   *   "displayName": "Test User",
   *   "email": "test@example.com"
   * }
   * ```
   */
  @Post('auth/bluesky-direct')
  async simulateBlueskyDirectLogin(
    @Body()
    body: {
      did: string;
      handle: string;
      displayName?: string;
      email?: string;
    },
    @Req() req,
  ) {
    const tenantId = req.tenantId;

    // Step 1: Find user via AT Protocol identity lookup (same as handleAuthCallback)
    const { user: existingUser } =
      await this.authBlueskyService.findUserByAtprotoIdentity(
        tenantId,
        body.did,
      );

    let loginResponse;

    if (existingUser) {
      // Step 2: Delegate shadow conversion + session creation to the shared method
      loginResponse = await this.authBlueskyService.loginExistingUser(
        existingUser,
        {
          did: body.did,
          handle: body.handle,
          displayName: body.displayName,
          email: body.email,
        },
        tenantId,
      );
    } else {
      // No existing user - fall back to validateSocialLogin (new user path)
      loginResponse = await this.authService.validateSocialLogin(
        AuthProvidersEnum.bluesky,
        {
          id: body.did,
          email: body.email || '',
          firstName: body.displayName || body.handle,
          lastName: '',
        },
        tenantId,
      );
    }

    return {
      token: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
      tokenExpires: loginResponse.tokenExpires,
      sessionId: loginResponse.sessionId,
      user: loginResponse.user,
    };
  }
}
