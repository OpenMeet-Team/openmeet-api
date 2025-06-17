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
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OidcService } from './services/oidc.service';
import { UseGuards } from '@nestjs/common';
import { JWTAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { Request } from 'express';
import { Trace } from '../utils/trace.decorator';

@ApiTags('OIDC')
@Controller('oidc')
export class OidcController {
  constructor(private readonly oidcService: OidcService) {}

  @ApiOperation({
    summary: 'OIDC Discovery Document',
    description:
      'OpenID Connect discovery endpoint (.well-known/openid-configuration)',
  })
  @Get('.well-known/openid-configuration')
  @Trace('oidc.api.discovery')
  getDiscoveryDocument() {
    return this.oidcService.getDiscoveryDocument();
  }

  @ApiOperation({
    summary: 'JSON Web Key Set',
    description: 'JWKS endpoint for token verification',
  })
  @Get('jwks')
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
  @UseGuards(JWTAuthGuard)
  // eslint-disable-next-line @typescript-eslint/require-await
  async authorize(
    @AuthUser() user: any,
    @Req() request: Request,
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

    // Get tenant ID from request
    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    // User is authenticated, generate authorization code and redirect
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
    return { url: result.redirect_url };
  }

  @ApiOperation({
    summary: 'Token Endpoint',
    description: 'Exchange authorization code for access and ID tokens',
  })
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async token(
    @Body('grant_type') grantType: string,
    @Body('code') code: string,
    @Body('redirect_uri') redirectUri: string,
    @Body('client_id') clientId: string,
    @Body('client_secret') clientSecret: string,
  ) {
    if (!grantType || !code || !redirectUri || !clientId || !clientSecret) {
      throw new BadRequestException('Missing required token parameters');
    }

    return await this.oidcService.exchangeCodeForTokens({
      grant_type: grantType,
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });
  }

  @ApiOperation({
    summary: 'User Info Endpoint',
    description: 'Get user information from access token',
  })
  @Get('userinfo')
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
  loginEntry(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('response_type') responseType: string,
    @Query('scope') scope: string,
    @Query('state') state?: string,
    @Query('nonce') nonce?: string,
  ) {
    // Store OIDC parameters in session and redirect to OpenMeet login
    // This is for when users access Matrix through third-party clients

    if (!clientId || !redirectUri || !responseType || !scope) {
      throw new BadRequestException('Missing required OIDC parameters');
    }

    // TODO: Store parameters in session/temporary storage
    // Then redirect to OpenMeet login page with return URL

    const loginUrl =
      `/auth/login?` +
      new URLSearchParams({
        return_url:
          `/oidc/auth?` +
          new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: responseType,
            scope,
            ...(state && { state }),
            ...(nonce && { nonce }),
          }).toString(),
      }).toString();

    return {
      login_url: loginUrl,
      message: 'Redirect to OpenMeet login to complete OIDC authentication',
    };
  }
}
