import {
  Controller,
  Get,
  Query,
  Res,
  Header,
  HttpStatus,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { AuthBlueskyService } from './auth-bluesky.service';
import { Response } from 'express';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../core/decorators/public.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { getOidcCookieOptions } from '../utils/cookie-config';
import { OAuthPlatform } from '../auth/types/oauth.types';

@ApiTags('Auth')
@Controller({
  path: 'auth/bluesky',
  version: '1',
})
export class AuthBlueskyController {
  private readonly logger = new Logger(AuthBlueskyController.name);

  constructor(private readonly authBlueskyService: AuthBlueskyService) {}

  @Get('authorize')
  @Public()
  @TenantPublic()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: String })
  async getAuthUrl(
    @Query('handle') handle: string,
    @Query('tenantId') tenantId: string,
    @Query('platform') platform?: OAuthPlatform,
  ) {
    return await this.authBlueskyService.createAuthUrl(
      handle,
      tenantId,
      platform,
    );
  }

  @Public()
  @TenantPublic()
  @Get('callback')
  async callback(@Query() query: any, @Res() res: Response) {
    const effectiveTenantId = query.tenantId;
    if (!effectiveTenantId) {
      this.logger.error('Missing tenant ID in callback query');
      throw new Error('Tenant ID is required in query parameters');
    }

    // Platform is determined inside handleAuthCallback using our appState
    // (which is returned by client.callback(), not from query.state)
    this.logger.debug('Handling Bluesky callback:', {
      tenantId: effectiveTenantId,
      state: query.state,
      code: query.code,
    });

    const { redirectUrl, sessionId } =
      await this.authBlueskyService.handleAuthCallback(
        query,
        effectiveTenantId,
      );

    // Set oidc_session cookie for cross-domain OIDC authentication
    if (sessionId) {
      const cookieOptions = getOidcCookieOptions();

      res.cookie('oidc_session', sessionId, cookieOptions);
      res.cookie('oidc_tenant', effectiveTenantId, cookieOptions);
    }

    res.redirect(redirectUrl);
  }

  @Public()
  @TenantPublic()
  @Get('client-metadata.json')
  @Header('Content-Type', 'application/json')
  async getClientMetadata(@Query('tenantId') tenantId: string) {
    const client = await this.authBlueskyService.initializeClient(tenantId);
    return client.clientMetadata;
  }

  @Public()
  @TenantPublic()
  @Get('jwks.json')
  @Header('Content-Type', 'application/json')
  async getJwks(@Query('tenantId') tenantId: string) {
    const client = await this.authBlueskyService.initializeClient(tenantId);
    return client.jwks;
  }
}
