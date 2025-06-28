import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OidcService } from './services/oidc.service';
import { Request, Response } from 'express';
import { Trace } from '../utils/trace.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayloadType } from '../auth/strategies/types/jwt-payload.type';
import { getTenantConfig } from '../utils/tenant-config';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import { UserService } from '../user/user.service';
// Removed MacaroonsVerifier - simplified to use URL state parameter

@ApiTags('OIDC')
@Controller('oidc')
export class OidcController {
  constructor(
    private readonly oidcService: OidcService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tempAuthCodeService: TempAuthCodeService,
    private readonly userService: UserService,
  ) {}

  // Removed extractStateFromMatrixSessionCookie - simplified to use URL state parameter
  // The macaroon parsing was incorrectly trying to decode binary data as UTF-8 text

  @ApiOperation({
    summary: 'OIDC Discovery Document',
    description:
      'OpenID Connect discovery endpoint (.well-known/openid-configuration)',
  })
  @Get('.well-known/openid-configuration')
  @TenantPublic()
  @Trace('oidc.api.discovery')
  getDiscoveryDocument(@Req() request: Request) {
    // Extract base URL from request
    const protocol =
      request.headers['x-forwarded-proto'] ||
      (request.secure ? 'https' : 'http');
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const baseUrl = `${protocol}://${host}`;

    return this.oidcService.getDiscoveryDocument(baseUrl);
  }

  @ApiOperation({
    summary: 'JSON Web Key Set',
    description: 'JWKS endpoint for token verification',
  })
  @Get('jwks')
  @TenantPublic()
  @Trace('oidc.api.jwks')
  getJwks() {
    return this.oidcService.getJwks();
  }

  @ApiOperation({
    summary: 'Authorization Endpoint',
    description:
      'OIDC authorization endpoint - redirects to login if not authenticated',
  })
  @Get('auth')
  @TenantPublic()
  async authorize(
    @Req() request: Request,
    @Res({ passthrough: false }) response: Response,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('response_type') responseType: string,
    @Query('scope') scope: string,
    @Query('state') state?: string,
    @Query('nonce') nonce?: string,
    @Query('auth_code') authCode?: string,
  ) {
    console.log('🔐 OIDC Auth Debug - Authorization endpoint called');
    console.log('  - Client ID:', clientId);
    console.log('  - State (Matrix session):', state?.substring(0, 20) + '...');
    console.log('  - Tenant ID from query:', request.query.tenantId);
    console.log(
      '  - Matrix State Preservation: Will preserve state parameter for session validation',
    );
    console.log('  - Headers:', {
      authorization: !!request.headers.authorization,
      cookie: !!request.headers.cookie,
      'x-tenant-id': request.headers['x-tenant-id'],
    });

    if (!clientId || !redirectUri || !responseType || !scope) {
      throw new BadRequestException('Missing required OIDC parameters');
    }

    // Use the state parameter from URL - Matrix passes this correctly
    const actualState = state;

    // Check if user is authenticated via active session or JWT token
    const authHeader = request.headers.authorization;
    let user: { id: number } | null = null;
    let tenantId: string | null = null;

    // First, get tenant ID from query parameters (added during email form submission)
    tenantId =
      (request.query.tenantId as string) ||
      (request.headers['x-tenant-id'] as string) ||
      null;

    console.log(
      '🔐 OIDC Auth Debug - Unified endpoint - checking for user authentication...',
    );

    // Method 1: Check for auth code in query parameters (highest priority for seamless authentication)
    if (!user && authCode) {
      console.log(
        '🔐 OIDC Auth Debug - Method 1: Found auth_code in query parameters, validating...',
      );
      try {
        const validatedUser =
          await this.tempAuthCodeService.validateAndConsumeAuthCode(authCode);
        if (validatedUser) {
          console.log(
            '✅ OIDC Auth Debug - Method 1 SUCCESS: Valid auth code, user ID:',
            validatedUser.userId,
          );
          user = { id: validatedUser.userId };
          tenantId = validatedUser.tenantId;
        }
      } catch (error) {
        console.error(
          '❌ OIDC Auth Debug - Method 1 FAILED: Auth code validation failed:',
          error.message,
        );
      }
    }

    // Method 2: REMOVED - Do not decode state parameter as it's meant to be opaque per OIDC spec
    // Matrix uses state for session macaroons, frontend uses other auth methods

    // Method 2: Check for user token in query parameters (sent by platform after OIDC login)
    // Re-enabled for third-party Matrix app authentication when no auth_code available
    if (!user) {
      // Re-enabled: needed for third-party Matrix OIDC flow
      const userToken = request.query.user_token as string;
      if (userToken) {
        console.log(
          '🔐 OIDC Auth Debug - Method 2: Found user_token in query parameters, validating...',
        );
        try {
          const payload: JwtPayloadType = await this.jwtService.verifyAsync(
            userToken,
            {
              secret: this.configService.get('auth.secret', { infer: true }),
            },
          );

          if (payload && payload.id) {
            console.log(
              '✅ OIDC Auth Debug - Method 2 SUCCESS: Valid user token, user ID:',
              payload.id,
            );
            user = { id: payload.id };
          }
        } catch (error) {
          console.error(
            '❌ OIDC Auth Debug - Method 2 FAILED: User token validation failed:',
            error.message,
          );
        }
      }
    }

    // Method 3: Fallback to JWT token in Authorization header
    if (
      !user &&
      authHeader &&
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ')
    ) {
      console.log(
        '🔐 OIDC Auth Debug - Method 3: Trying Authorization header...',
      );
      try {
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const payload: JwtPayloadType = await this.jwtService.verifyAsync(
          token,
          {
            secret: this.configService.get('auth.secret', { infer: true }),
          },
        );

        if (payload && payload.id) {
          console.log(
            '✅ OIDC Auth Debug - Method 3 SUCCESS: Valid JWT token from header, user ID:',
            payload.id,
          );
          user = { id: payload.id };
        }
      } catch (error) {
        console.error(
          '❌ OIDC Auth Debug - Method 3 FAILED: Authorization header JWT validation failed:',
          error.message,
        );
      }
    }

    // Method 4: Check for Matrix session cookie (OIDC flow)
    if (!user) {
      console.log(
        '🔐 OIDC Auth Debug - Method 4: Checking Matrix session authentication...',
      );
      try {
        console.log(
          '🔐 OIDC Auth Debug - Available cookies:',
          Object.keys(request.cookies || {}),
        );
        const sessionCookie = request.cookies?.['oidc_session'];
        console.log(
          '🔐 OIDC Auth Debug - Matrix session cookie value:',
          sessionCookie ? 'found' : 'not found',
        );

        if (sessionCookie) {
          console.log('🔍 Matrix Session Cookie DEBUG - Raw cookie analysis:');
          console.log('Length:', sessionCookie.length);
          console.log('First 50 chars:', sessionCookie.substring(0, 50));

          // IMPORTANT: Matrix session cookies are macaroons, not OpenMeet session IDs
          // We should NOT try to validate them as OpenMeet sessions
          // Instead, treat them as opaque session identifiers from Matrix

          console.log(
            '🔐 OIDC Auth Debug - Method 4: Matrix session cookie detected - this indicates Matrix SSO flow',
          );
          console.log(
            '🔐 OIDC Auth Debug - Method 4: Matrix macaroon cookies are opaque to us - skipping validation',
          );
          console.log(
            '🔐 OIDC Auth Debug - Method 4: User must authenticate through other methods for OIDC',
          );

          // Do NOT clear Matrix session cookies - they belong to Matrix, not us
          // Do NOT try to validate them as OpenMeet sessions
          // Matrix will validate them when we redirect back with auth code
        } else {
          console.log(
            '❌ OIDC Auth Debug - Method 4: No Matrix session cookie found',
          );
        }
      } catch (error) {
        console.log(
          '🔐 OIDC Auth Debug - Method 4 FAILED: Session authentication error:',
          error.message,
        );
      }
    }

    // Method 5: Try login_hint if provided (for seamless Matrix authentication)
    if (!user && request.query.login_hint) {
      const loginHint = request.query.login_hint as string;
      console.log(
        '🔐 OIDC Auth Debug - Method 5: Trying login_hint to find user:',
        loginHint,
      );

      try {
        // Find user by email across all tenants
        const userResult =
          await this.oidcService.findUserByEmailAcrossTenants(loginHint);

        if (userResult) {
          console.log(
            '✅ OIDC Auth Debug - Method 5 SUCCESS: Found user via login_hint in tenant:',
            userResult.tenantId,
            'user ID:',
            userResult.user.id,
          );

          // Generate a temporary auth code for this user
          const authCode = await this.tempAuthCodeService.generateAuthCode(
            userResult.user.id,
            userResult.tenantId,
          );

          // Store tenant ID for later use
          tenantId = userResult.tenantId;

          // Redirect to auth endpoint with the auth code
          const authUrl = new URL(
            request.url,
            `${request.protocol}://${request.get('host')}`,
          );
          authUrl.searchParams.set('auth_code', authCode);
          authUrl.searchParams.set('tenantId', tenantId);

          console.log(
            '🔄 OIDC Auth Debug - Method 5: Redirecting with generated auth code',
          );
          response.redirect(authUrl.toString());
          return;
        } else {
          console.log(
            '❌ OIDC Auth Debug - Method 5 FAILED: User not found with login_hint:',
            loginHint,
          );
        }
      } catch (error) {
        console.error(
          '❌ OIDC Auth Debug - Method 5 ERROR: Failed to process login_hint:',
          error.message,
        );
      }
    }

    // Method 7 (Last Resort): If no authenticated user found, redirect to login/email form
    if (!user) {
      console.log(
        '🔐 OIDC Auth Debug - Method 7 (LAST RESORT): No authenticated user found via any method, redirecting to login flow',
      );
      const baseUrl =
        this.configService.get('app.oidcIssuerUrl', { infer: true }) ||
        'http://localhost:3000';

      // Extract login_hint for email pre-fill
      const loginHint = request.query.login_hint as string;

      const oidcLoginParams = {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        scope,
        ...(state && { state }),
        ...(nonce && { nonce }),
        // Include login_hint for email pre-fill in login form
        ...(loginHint && { login_hint: loginHint }),
      };

      const oidcLoginUrl =
        `${baseUrl}/api/oidc/login?` +
        new URLSearchParams(oidcLoginParams).toString();

      console.log(
        '📧 OIDC Auth Debug - Method 7: Redirecting to login with email pre-fill:',
        loginHint || 'none',
      );

      response.redirect(oidcLoginUrl);
      return;
    }

    // User is authenticated, generate authorization code and redirect
    if (!user || !tenantId) {
      throw new UnauthorizedException(
        'User and tenant ID are required for authenticated users',
      );
    }

    // Validate user identity against login_hint if provided (security check)
    const loginHint = request.query.login_hint as string;
    if (loginHint) {
      try {
        const userEntity = await this.userService.findById(user.id, tenantId);

        if (userEntity && userEntity.email !== loginHint) {
          console.log(
            `🚨 SECURITY WARNING: Session user email (${userEntity.email}) does not match login_hint (${loginHint}) - redirecting to login`,
          );
          // Do NOT clear Matrix session cookies - they belong to Matrix server
          // Matrix will validate its own session cookies when we redirect back

          const baseUrl =
            this.configService.get('app.oidcIssuerUrl', { infer: true }) ||
            'http://localhost:3000';
          const oidcLoginUrl =
            `${baseUrl}/api/oidc/login?` +
            new URLSearchParams({
              client_id: clientId,
              redirect_uri: redirectUri,
              response_type: responseType,
              scope,
              ...(state && { state }),
              ...(nonce && { nonce }),
            }).toString();

          response.redirect(oidcLoginUrl);
          return;
        }
      } catch (error) {
        console.error(
          'Error validating user identity against login_hint:',
          error.message,
        );
      }
    }

    const result = this.oidcService.handleAuthorization(
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        scope,
        state: actualState, // Use extracted session state instead of URL state
        nonce,
      },
      user.id,
      tenantId,
    );

    // Redirect to Matrix server with authorization code
    response.redirect(result.redirect_url);
  }

  @ApiOperation({
    summary: 'Token Endpoint',
    description: 'Exchange authorization code for access and ID tokens',
  })
  @Post('token')
  @TenantPublic()
  @HttpCode(HttpStatus.OK)
  async token(
    @Body() body: any,
    @Body('grant_type') grantType: string,
    @Body('code') code: string,
    @Body('redirect_uri') redirectUri: string,
    @Body('client_id') clientId?: string,
    @Body('client_secret') clientSecret?: string,
  ) {
    console.log(
      '🔧 OIDC Token Debug - Request body:',
      JSON.stringify(body, null, 2),
    );
    console.log('🔧 OIDC Token Debug - Parameters:', {
      grantType,
      code: code?.substring(0, 20) + '...',
      redirectUri,
      clientId,
      clientSecret,
    });

    if (!grantType || !code || !redirectUri) {
      throw new BadRequestException(
        'Missing required token parameters: grant_type, code, redirect_uri',
      );
    }

    return await this.oidcService.exchangeCodeForTokens({
      grant_type: grantType,
      code,
      redirect_uri: redirectUri,
      client_id: clientId || '', // client_id is optional in the request, it's in the code
      client_secret: clientSecret || '',
    });
  }

  @ApiOperation({
    summary: 'User Info Endpoint',
    description: 'Get user information from access token',
  })
  @Get('userinfo')
  @TenantPublic()
  async userInfo(@Headers('authorization') authorization: string) {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token required');
    }

    const accessToken = authorization.substring(7); // Remove 'Bearer ' prefix
    return await this.oidcService.getUserInfo(accessToken);
  }

  @ApiOperation({
    summary: 'OIDC Login Entry Point',
    description: 'Entry point for OIDC authentication flow from Matrix clients',
  })
  @Get('login')
  @TenantPublic()
  async showLoginForm(
    @Req() request: Request,
    @Res({ passthrough: false }) response: Response,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('response_type') responseType: string,
    @Query('scope') scope: string,
    @Query('state') state?: string,
    @Query('nonce') nonce?: string,
    @Query('login_hint') loginHint?: string,
  ) {
    if (!clientId || !redirectUri || !responseType || !scope) {
      throw new BadRequestException('Missing required OIDC parameters');
    }

    console.log(
      '🔐 OIDC Login Debug - Checking if user is already authenticated...',
    );

    // Check if user is already authenticated via cookies or JWT token
    const authHeader = request.headers.authorization;
    let user: { id: number } | null = null;

    // Check for user token in query parameters (sent by platform after OIDC login)
    // Re-enabled for third-party Matrix app authentication flow
    const userToken = request.query.user_token as string;
    if (userToken) {
      // Re-enabled: needed for third-party Matrix OIDC flow
      console.log(
        '🔐 OIDC Login Debug - Found user_token in query parameters, validating...',
      );
      try {
        const payload: JwtPayloadType = await this.jwtService.verifyAsync(
          userToken,
          {
            secret: this.configService.get('auth.secret', { infer: true }),
          },
        );

        if (payload && payload.id) {
          console.log(
            '✅ OIDC Login Debug - Valid user token, user ID:',
            payload.id,
          );
          user = { id: payload.id };
        }
      } catch (error) {
        console.error(
          '❌ OIDC Login Debug - User token validation failed:',
          error.message,
        );
      }
    }

    // Fallback to JWT token in Authorization header
    if (
      !user &&
      authHeader &&
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ')
    ) {
      console.log('🔐 OIDC Login Debug - Trying Authorization header...');
      try {
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const payload: JwtPayloadType = await this.jwtService.verifyAsync(
          token,
          {
            secret: this.configService.get('auth.secret', { infer: true }),
          },
        );

        if (payload && payload.id) {
          console.log(
            '✅ OIDC Login Debug - Valid Authorization header, user ID:',
            payload.id,
          );
          user = { id: payload.id };
        }
      } catch (error) {
        console.error(
          '❌ OIDC Login Debug - Authorization header validation failed:',
          error.message,
        );
      }
    }

    // Check for Matrix session cookie (but don't validate as OpenMeet session)
    if (!user) {
      console.log('🔐 OIDC Login Debug - Checking for Matrix session...');
      try {
        const sessionCookie = request.cookies?.['oidc_session'];
        if (sessionCookie) {
          console.log(
            '🔐 OIDC Login Debug - Matrix session cookie detected - user may have active Matrix session',
          );
          console.log(
            '🔐 OIDC Login Debug - Matrix macaroon cookies are opaque to us - cannot validate as OpenMeet sessions',
          );
          // Do NOT try to validate Matrix cookies as OpenMeet sessions
          // Do NOT clear Matrix cookies - they belong to Matrix
        } else {
          console.log('🔐 OIDC Login Debug - No Matrix session cookie found');
        }
      } catch (error) {
        console.log(
          '🔐 OIDC Login Debug - Error checking Matrix session:',
          error.message,
        );
      }
    }

    // If user is authenticated, try to generate auth code and redirect seamlessly
    if (user) {
      console.log(
        '🔄 OIDC Login Debug - User is authenticated, attempting seamless OIDC flow...',
      );

      // For authenticated users, we need tenant information to proceed
      // Since Matrix cookies can't be validated as OpenMeet sessions,
      // we'll need the user to have been authenticated through other methods
      console.log(
        '✅ OIDC Login Debug - User authenticated, but need tenant info for seamless flow',
      );
      console.log(
        '⚠️ OIDC Login Debug - Cannot determine tenant from Matrix session cookies',
      );
      console.log(
        '🔄 OIDC Login Debug - Falling back to email form for tenant detection',
      );
    }

    console.log(
      '🔐 OIDC Login Debug - No authentication found, showing email form',
    );

    // Create simple HTML form for email input
    const formHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>OpenMeet Login</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; }
        input[type="email"] { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #005a87; }
      </style>
    </head>
    <body>
      <h2>Sign in to OpenMeet</h2>
      <p>Enter your email address to continue to Matrix</p>
      <form method="POST" action="/api/oidc/login">
        <input type="hidden" name="client_id" value="${clientId}">
        <input type="hidden" name="redirect_uri" value="${redirectUri}">
        <input type="hidden" name="response_type" value="${responseType}">
        <input type="hidden" name="scope" value="${scope}">
        ${state ? `<input type="hidden" name="state" value="${state}">` : ''}
        ${nonce ? `<input type="hidden" name="nonce" value="${nonce}">` : ''}
        
        <div class="form-group">
          <label for="email">Email address</label>
          <input type="email" id="email" name="email" value="${loginHint || ''}" required>
        </div>
        
        <button type="submit">Continue</button>
      </form>
    </body>
    </html>`;

    response.setHeader('Content-Type', 'text/html');
    response.send(formHtml);
  }

  @Post('login')
  @TenantPublic()
  async handleEmailLogin(
    @Res({ passthrough: false }) response: Response,
    @Body('email') email: string,
    @Body('client_id') clientId: string,
    @Body('redirect_uri') redirectUri: string,
    @Body('response_type') responseType: string,
    @Body('scope') scope: string,
    @Body('state') state?: string,
    @Body('nonce') nonce?: string,
  ) {
    if (!email || !clientId || !redirectUri || !responseType || !scope) {
      throw new BadRequestException('Missing required parameters');
    }

    // Look up user email across all tenants
    const userResult =
      await this.oidcService.findUserByEmailAcrossTenants(email);

    if (!userResult) {
      // User not found - show error
      const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>User Not Found</title></head>
      <body style="font-family: Arial, sans-serif; max-width: 400px; margin: 100px auto; padding: 20px;">
        <h2>Email not found</h2>
        <p>We couldn't find an account with the email address <strong>${email}</strong>.</p>
        <p>Please check your email address or contact your administrator.</p>
        <a href="javascript:history.back()">← Go back</a>
      </body>
      </html>`;

      response.setHeader('Content-Type', 'text/html');
      response.send(errorHtml);
      return;
    }

    // User found - redirect to tenant-specific login
    const { tenantId } = userResult;
    const tenantConfig = getTenantConfig(tenantId);

    const baseUrl =
      this.configService.get('app.oidcIssuerUrl', { infer: true }) ||
      'http://localhost:3000';

    const returnUrl =
      `${baseUrl}/api/oidc/auth?` +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        scope,
        tenantId: tenantId, // Add tenant ID to the return URL
        ...(state && { state }),
        ...(nonce && { nonce }),
      }).toString();

    console.log('🔗 OIDC Email Form Debug - Generated return URL:', returnUrl);

    // Create a login URL that stores OIDC flow data
    const tenantLoginUrl =
      `${tenantConfig.frontendDomain}/auth/login?` +
      new URLSearchParams({
        oidc_flow: 'true', // Flag to indicate this is an OIDC flow
        oidc_return_url: returnUrl, // Store the return URL
        oidc_tenant_id: tenantId, // Store tenant ID for session validation
      }).toString();

    console.log(
      '🔗 OIDC Email Form Debug - Tenant login URL with OIDC data:',
      tenantLoginUrl,
    );

    // Set tenant header for the login request
    response.setHeader('X-Tenant-ID', tenantId);
    response.redirect(tenantLoginUrl);
  }
}
