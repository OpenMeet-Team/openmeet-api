import {
  Controller,
  Get,
  Query,
  Res,
  Header,
  HttpStatus,
  HttpCode,
  Logger,
  Inject,
} from '@nestjs/common';
import { AuthBlueskyService } from './auth-bluesky.service';
import { Response } from 'express';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../core/decorators/public.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { REQUEST } from '@nestjs/core';
import { getOidcCookieOptions } from '../utils/cookie-config';

@ApiTags('Auth')
@Controller({
  path: 'auth/bluesky',
  version: '1',
})
export class AuthBlueskyController {
  private readonly logger = new Logger(AuthBlueskyController.name);

  constructor(
    private readonly authBlueskyService: AuthBlueskyService,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  @Get('authorize')
  @Public()
  @TenantPublic()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: String })
  async getAuthUrl(
    @Query('handle') handle: string,
    @Query('tenantId') tenantId: string,
  ) {
    return await this.authBlueskyService.createAuthUrl(handle, tenantId);
  }

  @Public()
  @TenantPublic()
  @Get('callback')
  async callback(@Query() query: any, @Res() res: Response) {
    const effectiveTenantId = query.tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      this.logger.error('Missing tenant ID in callback');
      throw new Error('Tenant ID is required');
    }

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
