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
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OidcService } from './services/oidc.service';
import { Request, Response } from 'express';
import { Trace } from '../utils/trace.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getTenantConfig } from '../utils/tenant-config';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import { UserService } from '../user/user.service';
import { MatrixRoomService } from '../matrix/services/matrix-room.service';
import { SessionService } from '../session/session.service';
// Removed MacaroonsVerifier - simplified to use URL state parameter

@ApiTags('OIDC')
@Controller('oidc')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);

  constructor(
    private readonly oidcService: OidcService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tempAuthCodeService: TempAuthCodeService,
    private readonly userService: UserService,
    private readonly matrixRoomService: MatrixRoomService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Check if a session is valid according to max_age parameter
   */
  private isSessionValidForMaxAge(session: any, maxAge?: string): boolean {
    if (!maxAge) return true; // No max_age restriction

    const maxAgeSeconds = parseInt(maxAge, 10);
    if (isNaN(maxAgeSeconds)) return true; // Invalid max_age, ignore restriction

    // Calculate session age in seconds
    const sessionCreatedAt = session.created_at || session.createdAt;
    if (!sessionCreatedAt) return true; // No creation time, can't enforce max_age

    const sessionAge = Math.floor(
      (Date.now() - new Date(sessionCreatedAt).getTime()) / 1000,
    );
    const isValid = sessionAge <= maxAgeSeconds;

    this.logger.debug(
      `🕐 Session age check: ${sessionAge}s <= ${maxAgeSeconds}s = ${isValid}`,
    );
    return isValid;
  }

  /**
   * Return an OIDC error response for prompt=none failures
   */
  private returnPromptNoneError(
    redirectUri: string,
    state?: string,
    error: string = 'login_required',
  ) {
    const errorParams = new URLSearchParams({
      error,
      error_description: 'Silent authentication failed',
      ...(state && { state }),
    });

    return `${redirectUri}?${errorParams.toString()}`;
  }

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
    @Query('prompt') prompt?: string,
    @Query('max_age') maxAge?: string,
  ) {
    this.logger.debug('🔐 OIDC Auth Debug - Authorization endpoint called');
    this.logger.debug('  - Client ID:', clientId);
    this.logger.debug(
      '  - State (Matrix session):',
      state?.substring(0, 20) + '...',
    );
    this.logger.debug('  - Tenant ID from query:', request.query.tenantId);
    this.logger.debug('  - Prompt parameter:', prompt);
    this.logger.debug('  - Max age parameter:', maxAge);
    this.logger.debug(
      '  - Matrix State Preservation: Will preserve state parameter for session validation',
    );
    this.logger.debug('  - Headers:', {
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
    let tenantId: string | undefined = undefined;

    // First, get tenant ID from query parameters (added during email form submission)
    tenantId =
      (request.query.tenantId as string) ||
      (request.headers['x-tenant-id'] as string) ||
      undefined;

    if (!tenantId) {
      throw new BadRequestException(
        'Tenant ID is required - provide x-tenant-id header or tenantId query parameter',
      );
    }

    this.logger.debug(
      '🔐 OIDC Auth Debug - Unified endpoint - checking for user authentication...',
    );

    // Method 1: Check for auth code in query parameters (highest priority for seamless authentication)
    if (!user && authCode) {
      this.logger.debug(
        '🔐 OIDC Auth Debug - Method 1: Found auth_code in query parameters, validating...',
      );
      try {
        const validatedUser =
          await this.tempAuthCodeService.validateAndConsumeAuthCode(authCode);
        if (validatedUser) {
          this.logger.debug(
            '✅ OIDC Auth Debug - Method 1 SUCCESS: Valid auth code, user ID:',
            validatedUser.userId,
          );
          user = { id: validatedUser.userId };
          tenantId = validatedUser.tenantId;
        }
      } catch (error) {
        this.logger.error(
          '❌ OIDC Auth Debug - Method 1 FAILED: Auth code validation failed:',
          error.message,
        );
      }
    }

    // Method 2: Check for OpenMeet session cookie (OIDC flow)
    if (!user) {
      this.logger.debug(
        '🔐 OIDC Auth Debug - Method 2: Checking OpenMeet session authentication...',
      );
      try {
        this.logger.debug(
          '🔐 OIDC Auth Debug - Available cookies:',
          Object.keys(request.cookies || {}),
        );
        const sessionCookie = request.cookies?.['oidc_session'];
        const tenantCookie = request.cookies?.['oidc_tenant'];
        this.logger.debug(
          '🔐 OIDC Auth Debug - OpenMeet session cookie value:',
          sessionCookie ? 'found' : 'not found',
        );
        this.logger.debug(
          '🔐 OIDC Auth Debug - OpenMeet tenant cookie value:',
          tenantCookie ? 'found' : 'not found',
        );

        if (sessionCookie && tenantCookie) {
          this.logger.debug(
            '🔍 OpenMeet Session Cookie DEBUG - Raw cookie analysis:',
          );
          this.logger.debug('Session Length:', sessionCookie.length);
          this.logger.debug(
            'Session First 50 chars:',
            sessionCookie.substring(0, 50),
          );
          this.logger.debug('Tenant ID:', tenantCookie);

          // IMPORTANT: oidc_session cookies are OpenMeet session IDs
          // These are set by OpenMeet auth controllers after successful login
          // We validate them as OpenMeet sessions to enable seamless OIDC flow

          this.logger.debug(
            '🔐 OIDC Auth Debug - Method 2: OpenMeet session and tenant cookies detected - validating session...',
          );

          try {
            // Validate the OpenMeet session with the tenant context
            const session = await this.sessionService.findById(
              sessionCookie,
              tenantCookie,
            );

            if (session && session.user) {
              this.logger.debug(
                '✅ OIDC Auth Debug - Method 2 SUCCESS: Valid OpenMeet session, user ID:',
                session.user.id,
              );
              user = { id: session.user.id };
              tenantId = tenantCookie;

              this.logger.debug(
                '✅ OIDC Auth Debug - Method 2: Tenant ID from cookie:',
                tenantId,
              );
            } else {
              this.logger.debug(
                '❌ OIDC Auth Debug - Method 2 FAILED: Invalid or expired OpenMeet session',
              );
            }
          } catch (sessionError) {
            this.logger.debug(
              '❌ OIDC Auth Debug - Method 2 FAILED: Session validation error:',
              sessionError.message,
            );
          }
        } else if (sessionCookie && !tenantCookie) {
          this.logger.debug(
            '🔄 OIDC Auth Debug - Method 2: Found old format session cookie without tenant - attempting backward compatibility',
          );

          // Backward compatibility: try to find user across all tenants
          // This handles sessions created before we added the separate tenant cookie
          try {
            const userResult =
              await this.oidcService.findUserBySessionIdAcrossTenants(
                Number(sessionCookie),
              );

            if (userResult) {
              this.logger.debug(
                '✅ OIDC Auth Debug - Method 2 BACKWARD COMPATIBILITY SUCCESS: Found session across tenants, user ID:',
                userResult.user.id,
              );
              user = { id: userResult.user.id };
              tenantId = userResult.tenantId;

              this.logger.debug(
                '✅ OIDC Auth Debug - Method 2: Tenant ID from cross-tenant lookup:',
                tenantId,
              );
            } else {
              this.logger.debug(
                '❌ OIDC Auth Debug - Method 2 BACKWARD COMPATIBILITY FAILED: Session not found across tenants',
              );
            }
          } catch (backwardCompatError) {
            this.logger.debug(
              '❌ OIDC Auth Debug - Method 2 BACKWARD COMPATIBILITY ERROR:',
              backwardCompatError.message,
            );
          }
        } else {
          this.logger.debug(
            '❌ OIDC Auth Debug - Method 2: No OpenMeet session cookie found',
          );
        }
      } catch (error) {
        this.logger.debug(
          '🔐 OIDC Auth Debug - Method 2 FAILED: Session authentication error:',
          error.message,
        );
      }
    }

    // Handle prompt=none - Silent Authentication
    if (prompt === 'none') {
      this.logger.debug(
        '🔇 OIDC Silent Auth - prompt=none detected, checking authentication status',
      );

      if (!user || !tenantId) {
        this.logger.debug(
          '❌ OIDC Silent Auth - No authenticated user found, returning login_required error',
        );
        const errorUrl = this.returnPromptNoneError(
          redirectUri,
          state,
          'login_required',
        );
        response.redirect(errorUrl);
        return;
      }

      // Check session age if max_age is specified
      if (maxAge) {
        this.logger.debug(
          `🕐 OIDC Silent Auth - Checking session age against max_age: ${maxAge}s`,
        );

        try {
          // Get the session to check its age
          const sessionCookie = request.cookies?.['oidc_session'];
          if (sessionCookie && tenantId) {
            const session = await this.sessionService.findById(
              sessionCookie,
              tenantId,
            );

            if (!session || !this.isSessionValidForMaxAge(session, maxAge)) {
              this.logger.debug(
                '❌ OIDC Silent Auth - Session too old or invalid, returning login_required error',
              );
              const errorUrl = this.returnPromptNoneError(
                redirectUri,
                state,
                'login_required',
              );
              response.redirect(errorUrl);
              return;
            }
          }
        } catch (error) {
          this.logger.debug(
            '❌ OIDC Silent Auth - Error checking session age:',
            error.message,
          );
          const errorUrl = this.returnPromptNoneError(
            redirectUri,
            state,
            'login_required',
          );
          response.redirect(errorUrl);
          return;
        }
      }

      this.logger.debug(
        '✅ OIDC Silent Auth - User authenticated and session valid, proceeding with silent flow',
      );
      // Continue to normal authorization flow below
    }

    // Method 3 (Last Resort): If no authenticated user found, redirect to login/email form
    if (!user) {
      this.logger.debug(
        '🔐 OIDC Auth Debug - Method 3 (LAST RESORT): No authenticated user found via any method, redirecting to login flow',
      );
      const baseUrl = this.configService.get('app.oidcIssuerUrl', {
        infer: true,
      });
      if (!baseUrl) {
        throw new Error(
          'OIDC issuer URL not configured - app.oidcIssuerUrl is required',
        );
      }

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

      this.logger.debug(
        '📧 OIDC Auth Debug - Method 3: Redirecting to login with email pre-fill:',
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
          this.logger.debug(
            `🚨 SECURITY WARNING: Session user email (${userEntity.email}) does not match login_hint (${loginHint}) - redirecting to login`,
          );
          // Do NOT clear Matrix session cookies - they belong to Matrix server
          // Matrix will validate its own session cookies when we redirect back

          const baseUrl = this.configService.get('app.oidcIssuerUrl', {
            infer: true,
          });
          if (!baseUrl) {
            throw new Error(
              'OIDC issuer URL not configured - app.oidcIssuerUrl is required',
            );
          }
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
        this.logger.error(
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
    description:
      'Exchange authorization code or refresh token for access and ID tokens',
  })
  @Post('token')
  @TenantPublic()
  @HttpCode(HttpStatus.OK)
  async token(
    @Body() body: any,
    @Body('grant_type') grantType: string,
    @Body('code') code?: string,
    @Body('redirect_uri') redirectUri?: string,
    @Body('refresh_token') refreshToken?: string,
    @Body('scope') scope?: string,
    @Body('client_id') clientId?: string,
    @Body('client_secret') clientSecret?: string,
  ) {
    this.logger.debug(
      '🔧 OIDC Token Debug - Request body:',
      JSON.stringify(body, null, 2),
    );
    this.logger.debug('🔧 OIDC Token Debug - Parameters:', {
      grantType,
      code: code?.substring(0, 20) + '...',
      refreshToken: refreshToken?.substring(0, 20) + '...',
      redirectUri,
      clientId,
      clientSecret,
    });

    if (!grantType) {
      throw new BadRequestException('Missing required parameter: grant_type');
    }

    // Handle authorization_code grant
    if (grantType === 'authorization_code') {
      if (!code || !redirectUri) {
        throw new BadRequestException(
          'Missing required parameters for authorization_code: code, redirect_uri',
        );
      }

      return await this.oidcService.exchangeCodeForTokens({
        grant_type: grantType,
        code,
        redirect_uri: redirectUri,
        client_id: clientId || '',
        client_secret: clientSecret || '',
      });
    }

    // Handle refresh_token grant
    if (grantType === 'refresh_token') {
      if (!refreshToken) {
        throw new BadRequestException(
          'Missing required parameter for refresh_token: refresh_token',
        );
      }

      return await this.oidcService.refreshAccessToken({
        grant_type: grantType,
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope,
      });
    }

    throw new BadRequestException(`Unsupported grant_type: ${grantType}`);
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
    @Query('tenant_id') tenantId?: string,
  ) {
    if (!clientId || !redirectUri || !responseType || !scope) {
      throw new BadRequestException('Missing required OIDC parameters');
    }

    this.logger.debug(
      '🔐 OIDC Login Debug - Checking if user is already authenticated...',
    );

    // Check if user is already authenticated via session cookies
    let user: { id: number } | null = null;

    // Check for OpenMeet session cookie (same logic as auth endpoint)
    if (!user) {
      this.logger.debug(
        '🔐 OIDC Login Debug - Checking for OpenMeet session...',
      );
      try {
        const sessionCookie = request.cookies?.['oidc_session'];
        const tenantCookie = request.cookies?.['oidc_tenant'];

        if (sessionCookie && tenantCookie) {
          this.logger.debug(
            '🔐 OIDC Login Debug - OpenMeet session and tenant cookies detected - validating session...',
          );

          try {
            // Validate the OpenMeet session with the tenant context
            const session = await this.sessionService.findById(
              sessionCookie,
              tenantCookie,
            );

            if (session && session.user) {
              this.logger.debug(
                '✅ OIDC Login Debug - Valid OpenMeet session, user ID:',
                session.user.id,
              );
              user = { id: session.user.id };
              tenantId = tenantCookie;

              this.logger.debug(
                '✅ OIDC Login Debug - Tenant ID from cookie:',
                tenantId,
              );
            } else {
              this.logger.debug(
                '❌ OIDC Login Debug - Invalid or expired OpenMeet session',
              );
            }
          } catch (sessionError) {
            this.logger.debug(
              '❌ OIDC Login Debug - Session validation error:',
              sessionError.message,
            );
          }
        } else if (sessionCookie && !tenantCookie) {
          this.logger.debug(
            '🔄 OIDC Login Debug - Found old format session cookie without tenant - attempting backward compatibility',
          );

          // Backward compatibility: try to find user across all tenants
          try {
            const userResult =
              await this.oidcService.findUserBySessionIdAcrossTenants(
                Number(sessionCookie),
              );

            if (userResult) {
              this.logger.debug(
                '✅ OIDC Login Debug - BACKWARD COMPATIBILITY SUCCESS: Found session across tenants, user ID:',
                userResult.user.id,
              );
              user = { id: userResult.user.id };
              tenantId = userResult.tenantId;

              this.logger.debug(
                '✅ OIDC Login Debug - Tenant ID from cross-tenant lookup:',
                tenantId,
              );
            } else {
              this.logger.debug(
                '❌ OIDC Login Debug - BACKWARD COMPATIBILITY FAILED: Session not found across tenants',
              );
            }
          } catch (backwardCompatError) {
            this.logger.debug(
              '❌ OIDC Login Debug - BACKWARD COMPATIBILITY ERROR:',
              backwardCompatError.message,
            );
          }
        } else {
          this.logger.debug(
            '🔐 OIDC Login Debug - No complete OpenMeet session cookies found',
          );
        }
      } catch (error) {
        this.logger.debug(
          '🔐 OIDC Login Debug - Error checking OpenMeet session:',
          error.message,
        );
      }
    }

    // If user is authenticated, try to generate auth code and redirect seamlessly
    if (user) {
      this.logger.debug(
        '🔄 OIDC Login Debug - User is authenticated, attempting seamless OIDC flow...',
      );

      // Check for tenant cookie first - if available, we can skip email form entirely
      const tenantCookie = request.cookies?.['oidc_tenant'];

      // For ngrok domains where cookies don't work, extract tenant from user_token JWT
      let tenantFromToken: string | undefined;
      if (!tenantCookie) {
        const userToken = request.query.user_token as string;
        if (userToken) {
          try {
            const payload: any = await this.jwtService.verifyAsync(userToken, {
              secret: this.configService.get('auth.secret', { infer: true }),
            });
            tenantFromToken = payload.tenantId;
            this.logger.debug(
              `🔑 OIDC Login Debug - Extracted tenant from JWT: ${tenantFromToken}`,
            );
          } catch (error) {
            this.logger.debug(
              '❌ OIDC Login Debug - Failed to extract tenant from JWT:',
              error.message,
            );
          }
        }
      }

      const effectiveTenant = tenantCookie || tenantFromToken;

      if (effectiveTenant) {
        this.logger.debug(
          '✅ OIDC Login Debug - User authenticated AND tenant info found, bypassing email form',
        );
        this.logger.debug(
          `🏢 OIDC Login Debug - Using tenant: ${effectiveTenant} (source: ${tenantCookie ? 'cookie' : 'JWT'})`,
        );

        // Validate that the tenant exists
        try {
          getTenantConfig(effectiveTenant);
          this.logger.debug(
            `✅ OIDC Login Debug - Tenant ${effectiveTenant} validated, redirecting directly to auth endpoint`,
          );

          const baseUrl = this.configService.get('app.oidcIssuerUrl', {
            infer: true,
          });
          if (!baseUrl) {
            throw new Error(
              'OIDC issuer URL not configured - app.oidcIssuerUrl is required',
            );
          }

          const returnUrl =
            `${baseUrl}/api/oidc/auth?` +
            new URLSearchParams({
              client_id: clientId,
              redirect_uri: redirectUri,
              response_type: responseType,
              scope: scope,
              ...(state && { state }),
              ...(nonce && { nonce }),
              tenant_id: effectiveTenant,
            }).toString();

          this.logger.debug(
            `🚀 OIDC Login Debug - Seamless redirect to: ${returnUrl}`,
          );

          response.redirect(returnUrl);
          return;
        } catch (error) {
          this.logger.error(
            `❌ OIDC Login Debug - Error during seamless flow: ${error.message}`,
          );
          // Fall through to email form if tenant is invalid or config missing
        }
      }

      // No valid tenant info - need tenant information to proceed
      this.logger.debug(
        '✅ OIDC Login Debug - User authenticated, but no valid tenant info found',
      );
      this.logger.debug(
        '🔄 OIDC Login Debug - Falling back to email form for tenant detection',
      );
    }

    this.logger.debug(
      '🔐 OIDC Login Debug - No authentication found, checking for tenant_id parameter',
    );

    // If tenant_id is provided from the frontend, skip email prompt and redirect directly
    if (tenantId) {
      this.logger.debug(
        `🏢 OIDC Login Debug - Tenant ID provided (${tenantId}), skipping email prompt for tenant discovery`,
      );

      // Validate that the tenant exists
      try {
        getTenantConfig(tenantId);
        this.logger.debug(
          `✅ OIDC Login Debug - Tenant ${tenantId} validated, redirecting to tenant-specific auth`,
        );

        const baseUrl = this.configService.get('app.oidcIssuerUrl', {
          infer: true,
        });
        if (!baseUrl) {
          throw new Error(
            'OIDC issuer URL not configured - app.oidcIssuerUrl is required',
          );
        }

        const returnUrl =
          `${baseUrl}/api/oidc/auth?` +
          new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: responseType,
            scope: scope,
            ...(state && { state }),
            ...(nonce && { nonce }),
            tenant_id: tenantId,
          }).toString();

        this.logger.debug(
          `🔄 OIDC Login Debug - Redirecting to tenant-specific login: ${returnUrl}`,
        );

        response.redirect(returnUrl);
        return;
      } catch (error) {
        this.logger.error(
          `❌ OIDC Login Debug - Invalid tenant ID ${tenantId}: ${error.message}`,
        );
        // Fall through to email form if tenant is invalid
      }
    }

    this.logger.debug(
      '🔐 OIDC Login Debug - No valid tenant_id provided, showing email form for tenant discovery',
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

    const baseUrl = this.configService.get('app.oidcIssuerUrl', {
      infer: true,
    });
    if (!baseUrl) {
      throw new Error(
        'OIDC issuer URL not configured - app.oidcIssuerUrl is required',
      );
    }

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

    this.logger.debug(
      '🔗 OIDC Email Form Debug - Generated return URL:',
      returnUrl,
    );

    // Create a login URL that stores OIDC flow data
    const tenantLoginUrl =
      `${tenantConfig.frontendDomain}/auth/login?` +
      new URLSearchParams({
        oidc_flow: 'true', // Flag to indicate this is an OIDC flow
        oidc_return_url: returnUrl, // Store the return URL
        oidc_tenant_id: tenantId, // Store tenant ID for session validation
      }).toString();

    this.logger.debug(
      '🔗 OIDC Email Form Debug - Tenant login URL with OIDC data:',
      tenantLoginUrl,
    );

    // Set tenant header for the login request
    response.setHeader('X-Tenant-ID', tenantId);
    response.redirect(tenantLoginUrl);
  }
}
