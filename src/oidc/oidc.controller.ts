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
import { getTenantConfig, fetchTenants } from '../utils/tenant-config';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import * as crypto from 'crypto';

@ApiTags('OIDC')
@Controller('oidc')
export class OidcController {
  constructor(
    private readonly oidcService: OidcService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly tempAuthCodeService: TempAuthCodeService,
  ) {}

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
  ) {
    console.log('🔐 OIDC Auth Debug - Authorization endpoint called');
    console.log('  - Client ID:', clientId);
    console.log('  - State:', state?.substring(0, 10) + '...');
    console.log('  - Tenant ID from query:', request.query.tenantId);
    console.log('  - Headers:', {
      authorization: !!request.headers.authorization,
      cookie: !!request.headers.cookie,
      'x-tenant-id': request.headers['x-tenant-id'],
    });

    if (!clientId || !redirectUri || !responseType || !scope) {
      throw new BadRequestException('Missing required OIDC parameters');
    }

    // Check if user is authenticated via active session or JWT token
    const authHeader = request.headers.authorization;
    let user: { id: number } | null = null;
    let tenantId: string | null = null;

    // First, get tenant ID from query parameters (added during email form submission)
    tenantId =
      (request.query.tenantId as string) ||
      (request.headers['x-tenant-id'] as string) ||
      null;

    console.log('🔐 OIDC Auth Debug - Checking for user authentication...');

    // Check for user token in query parameters (sent by frontend after login)
    if (!user) {
      const userToken = request.query.user_token as string;
      if (userToken) {
        console.log(
          '🔐 OIDC Auth Debug - Found user_token in query parameters, validating...',
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
              '✅ OIDC Auth Debug - Valid user token, user ID:',
              payload.id,
            );
            user = { id: payload.id };
          }
        } catch (error) {
          console.error(
            '❌ OIDC Auth Debug - User token validation failed:',
            error.message,
          );
        }
      }
    }

    // Fallback to JWT token in Authorization header
    if (
      !user &&
      authHeader &&
      typeof authHeader === 'string' &&
      authHeader.startsWith('Bearer ')
    ) {
      console.log(
        '🔐 OIDC Auth Debug - No session/token found, trying Authorization header...',
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
            '✅ OIDC Auth Debug - Valid JWT token from header, user ID:',
            payload.id,
          );
          user = { id: payload.id };
        }
      } catch (error) {
        console.error(
          '❌ OIDC Auth Debug - Authorization header JWT validation failed:',
          error.message,
        );
      }
    }

    // Check for authenticated user via session cookie
    if (!user) {
      console.log('🔐 OIDC Auth Debug - Checking session authentication...');
      try {
        console.log('🔐 OIDC Auth Debug - Available cookies:', Object.keys(request.cookies || {}));
        const sessionCookie = request.cookies?.['oidc_session'];
        console.log('🔐 OIDC Auth Debug - OIDC session cookie value:', sessionCookie ? 'found' : 'not found');
        if (sessionCookie) {
          console.log('🔐 OIDC Auth Debug - Session cookie found, scanning all tenants for authenticated user');
          
          const tenants = fetchTenants();
          for (const tenant of tenants) {
            if (!tenant.id) continue;
            try {
              const userFromSession = await this.oidcService.getUserFromSession(
                sessionCookie,
                tenant.id,
              );
              if (userFromSession) {
                console.log(
                  '✅ OIDC Auth Debug - Found authenticated user via session in tenant:',
                  tenant.id,
                  'user ID:',
                  userFromSession.id,
                );
                user = { id: userFromSession.id };
                tenantId = tenant.id;
                break;
              }
            } catch (error) {
              console.log(
                '🔍 OIDC Auth Debug - No user found in tenant:',
                tenant.id,
                error.message,
              );
            }
          }
          
          if (!user) {
            console.log('❌ OIDC Auth Debug - No authenticated user found in any tenant');
          }
        } else {
          console.log('❌ OIDC Auth Debug - No session cookie found');
        }
      } catch (error) {
        console.log('🔐 OIDC Auth Debug - Session authentication error:', error.message);
      }
    }

    // If no authenticated user, redirect to login
    if (!user) {
      console.log('🔐 OIDC Auth Debug - No authenticated user found, redirecting to login flow');
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

    // User is authenticated, generate authorization code and redirect
    if (!user || !tenantId) {
      throw new UnauthorizedException(
        'User and tenant ID are required for authenticated users',
      );
    }

    const result = this.oidcService.handleAuthorization(
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: responseType,
        scope,
        state,
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
    summary: 'Matrix SSO Direct Authentication',
    description:
      'Direct OIDC authentication for Matrix SSO - bypasses email form',
  })
  @Get('matrix-auth')
  @TenantPublic()
  async matrixDirectAuth(
    @Req() request: Request,
    @Res({ passthrough: false }) response: Response,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('response_type') responseType: string,
    @Query('scope') scope: string,
    @Query('state') state?: string,
    @Query('nonce') nonce?: string,
    @Query('auth_code') authCode?: string,
    @Query('tenant_id') tenantId?: string,
  ) {
    console.log(
      '🔥 Matrix Direct Auth - Starting direct authentication for Matrix SSO',
    );

    if (!clientId || !redirectUri || !responseType || !scope) {
      throw new BadRequestException('Missing required OIDC parameters');
    }

    // Check for auth code in query parameter first
    let authCodeToValidate = authCode;

    // Skip state parameter parsing - Matrix corrupts the data and we use session auth instead

    // Check for auth code (highest priority for seamless authentication)
    if (authCodeToValidate) {
      console.log('🔐 Matrix Direct Auth - Auth code provided, validating...');
      try {
        const authData =
          await this.tempAuthCodeService.validateAndConsumeAuthCode(
            authCodeToValidate,
          );
        if (authData) {
          console.log(
            `✅ Matrix Direct Auth - Auth code validated for user ${authData.userId}, tenant ${authData.tenantId}`,
          );

          // Generate authorization code using OIDC service
          const result = this.oidcService.handleAuthorization(
            {
              client_id: clientId,
              redirect_uri: redirectUri,
              response_type: responseType,
              scope,
              state,
              nonce,
            },
            authData.userId,
            authData.tenantId,
          );

          console.log(
            '🔄 Matrix Direct Auth - Redirecting back to Matrix with auth code (seamless flow)',
          );
          response.redirect(result.redirect_url);
          return;
        } else {
          console.log(
            '❌ Matrix Direct Auth - Auth code validation failed, falling back to session check',
          );
        }
      } catch (error) {
        console.error(
          '❌ Matrix Direct Auth - Auth code validation error:',
          error.message,
        );
      }
    }

    // Check for session cookie to find authenticated user
    try {
      const sessionCookie = request.cookies?.['oidc_session'];
      if (!sessionCookie) {
        console.log(
          '❌ Matrix Direct Auth - No session cookie found, redirecting to regular OIDC flow',
        );
        // No session found, redirect to the regular OIDC auth flow (which will show email form)
        const oidcAuthUrl =
          `/api/oidc/auth?` +
          new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: responseType,
            scope,
            ...(state && { state }),
            ...(nonce && { nonce }),
            ...(tenantId && { tenantId }), // Pass tenant ID if provided
          }).toString();

        response.redirect(oidcAuthUrl);
        return;
      }

      // Find user from session - prioritize specific tenant if provided
      let authenticatedUser: { id: number; tenantId: string } | null = null;
      let userTenantId: string | null = null;

      if (tenantId) {
        // Check specific tenant first if provided
        console.log(
          '🏢 Matrix Direct Auth - Checking specific tenant:',
          tenantId,
        );
        try {
          const userFromSession = await this.oidcService.getUserFromSession(
            sessionCookie,
            tenantId,
          );
          if (userFromSession) {
            authenticatedUser = userFromSession;
            userTenantId = tenantId;
            console.log(
              '✅ Matrix Direct Auth - Found authenticated user in specified tenant:',
              tenantId,
            );
          }
        } catch (error) {
          console.log(
            '❌ Matrix Direct Auth - User not found in specified tenant:',
            tenantId,
          );
        }
      }

      // If not found in specific tenant or no tenant specified, scan all tenants
      if (!authenticatedUser) {
        console.log(
          '🔍 Matrix Direct Auth - Scanning all tenants for authenticated user',
        );
        const tenants = fetchTenants();
        for (const tenant of tenants) {
          if (!tenant.id) continue; // Skip public tenant

          try {
            const userFromSession = await this.oidcService.getUserFromSession(
              sessionCookie,
              tenant.id,
            );
            if (userFromSession) {
              authenticatedUser = userFromSession;
              userTenantId = tenant.id;
              console.log(
                '✅ Matrix Direct Auth - Found authenticated user in tenant:',
                tenant.id,
              );
              break;
            }
          } catch (error) {
            // Continue to next tenant
          }
        }
      }

      if (!authenticatedUser || !userTenantId) {
        console.log(
          '❌ Matrix Direct Auth - No authenticated user found in any tenant',
        );
        throw new UnauthorizedException('User must be authenticated');
      }

      // Generate authorization code using OIDC service
      const result = this.oidcService.handleAuthorization(
        {
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: responseType,
          scope,
          state,
          nonce,
        },
        authenticatedUser.id,
        userTenantId,
      );

      console.log(
        '🔄 Matrix Direct Auth - Redirecting back to Matrix with auth code',
      );
      response.redirect(result.redirect_url);
    } catch (error) {
      console.error('❌ Matrix Direct Auth - Error:', error.message);
      throw new UnauthorizedException(
        'Authentication failed: ' + error.message,
      );
    }
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

    // Check for user token in query parameters (sent by frontend after login)
    const userToken = request.query.user_token as string;
    if (userToken) {
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

    // Check for authenticated user via session cookie
    if (!user) {
      console.log('🔐 OIDC Login Debug - Checking session authentication...');
      try {
        const sessionCookie = request.cookies?.['oidc_session'];
        if (sessionCookie) {
          const tenants = fetchTenants();
          for (const tenant of tenants) {
            if (!tenant.id) continue;
            try {
              const userFromSession = await this.oidcService.getUserFromSession(
                sessionCookie,
                tenant.id,
              );
              if (userFromSession) {
                console.log(
                  '✅ OIDC Login Debug - Found authenticated user via session:',
                  tenant.id,
                );
                user = { id: userFromSession.id };
                break;
              }
            } catch (error) {
              // Continue to next tenant
            }
          }
        }
      } catch (error) {
        console.log('🔐 OIDC Login Debug - No session authentication found');
      }
    }

    // If user is authenticated, try to generate auth code and redirect seamlessly
    if (user) {
      console.log(
        '🔄 OIDC Login Debug - User is authenticated, attempting seamless OIDC flow...',
      );

      // Get the user's tenant from session
      try {
        const sessionCookie = request.cookies?.['oidc_session'];
        if (sessionCookie) {
          const tenants = fetchTenants();
          for (const tenant of tenants) {
            if (!tenant.id) continue;
            try {
              const userFromSession = await this.oidcService.getUserFromSession(
                sessionCookie,
                tenant.id,
              );
              if (userFromSession) {
                console.log(
                  '✅ OIDC Login Debug - Found user session in tenant:',
                  tenant.id,
                );

                // Try to generate auth code for seamless flow
                try {
                  const authCode = await this.tempAuthCodeService.generateAuthCode(
                    userFromSession.id,
                    tenant.id,
                  );
                  
                  console.log(
                    '✅ OIDC Login Debug - Generated auth code, redirecting directly to auth endpoint',
                  );
                  
                  // Redirect directly to auth endpoint with auth code
                  const baseUrl =
                    this.configService.get('app.oidcIssuerUrl', {
                      infer: true,
                    }) || 'http://localhost:3000';
                  const authUrl =
                    `${baseUrl}/api/oidc/auth?` +
                    new URLSearchParams({
                      client_id: clientId,
                      redirect_uri: redirectUri,
                      response_type: responseType,
                      scope,
                      auth_code: authCode,
                      tenantId: tenant.id,
                      ...(state && { state }),
                      ...(nonce && { nonce }),
                    }).toString();

                  response.setHeader('X-Tenant-ID', tenant.id);
                  response.redirect(authUrl);
                  return;
                } catch (authCodeError) {
                  console.warn(
                    '⚠️ OIDC Login Debug - Failed to generate auth code, falling back to platform flow:',
                    authCodeError.message,
                  );
                  
                  // Fallback to platform-mediated flow
                  const baseUrl =
                    this.configService.get('app.oidcIssuerUrl', {
                      infer: true,
                    }) || 'http://localhost:3000';
                  const returnUrl =
                    `${baseUrl}/api/oidc/auth?` +
                    new URLSearchParams({
                      client_id: clientId,
                      redirect_uri: redirectUri,
                      response_type: responseType,
                      scope,
                      tenantId: tenant.id,
                      ...(state && { state }),
                      ...(nonce && { nonce }),
                    }).toString();

                  const tenantConfig = getTenantConfig(tenant.id);
                  const tenantLoginUrl =
                    `${tenantConfig.frontendDomain}/auth/login?` +
                    new URLSearchParams({
                      oidc_flow: 'true',
                      oidc_return_url: returnUrl,
                      oidc_tenant_id: tenant.id,
                    }).toString();

                  console.log(
                    '🔄 OIDC Login Debug - Redirecting to platform flow:',
                    tenantLoginUrl,
                  );
                  response.setHeader('X-Tenant-ID', tenant.id);
                  response.redirect(tenantLoginUrl);
                  return;
                }
              }
            } catch (error) {
              // Continue to next tenant
            }
          }
        }
      } catch (error) {
        console.error(
          '🔄 OIDC Login Debug - Error processing authenticated user:',
          error.message,
        );
      }
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
          <input type="email" id="email" name="email" required>
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
