import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  Res,
  Request,
  Header,
  HttpStatus,
  HttpCode,
  Logger,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthBlueskyService } from './auth-bluesky.service';
import { Response } from 'express';
import { ApiOkResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../core/decorators/public.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { getOidcCookieOptions } from '../utils/cookie-config';
import { OAuthPlatform } from '../auth/types/oauth.types';
import { LinkAtprotoDto } from './dto/link-atproto.dto';
import { UserService } from '../user/user.service';
import { ModuleRef } from '@nestjs/core';

@ApiTags('Auth')
@Controller({
  path: 'auth/bluesky',
  version: '1',
})
export class AuthBlueskyController {
  private readonly logger = new Logger(AuthBlueskyController.name);

  constructor(
    private readonly authBlueskyService: AuthBlueskyService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private async getUserService(): Promise<UserService> {
    return await this.moduleRef.resolve(UserService, undefined, {
      strict: false,
    });
  }

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

  @Post('link')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Returns OAuth authorization URL for AT Protocol identity linking',
  })
  async linkAtprotoIdentity(
    @Body() dto: LinkAtprotoDto,
    @Request() request: any,
  ): Promise<{ authUrl: string }> {
    const tenantId = request.tenantId;
    const userId = request.user?.id;

    this.logger.debug('Link AT Protocol identity request', {
      handle: dto.handle,
      tenantId,
      userId,
    });

    const userService = await this.getUserService();
    const user = await userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const authUrl = await this.authBlueskyService.createLinkAuthUrl(
      dto.handle,
      tenantId,
      user.ulid,
      dto.platform,
    );

    return { authUrl };
  }

  /**
   * OAuth callback - query parameter version (legacy, kept for backwards compatibility)
   */
  @Public()
  @TenantPublic()
  @Get('callback')
  async callback(@Query() query: any, @Res() res: Response) {
    const effectiveTenantId = query.tenantId;
    if (!effectiveTenantId) {
      this.logger.error('Missing tenant ID in callback query');
      throw new Error('Tenant ID is required in query parameters');
    }

    return this.handleCallback(query, effectiveTenantId, res);
  }

  /**
   * OAuth callback - path parameter version (required for PDS compatibility).
   * The PDS strips query parameters from redirect URIs, so tenantId must be in the path.
   */
  @Public()
  @TenantPublic()
  @Get('t/:tenantId/callback')
  async callbackWithPathTenant(
    @Param('tenantId') tenantId: string,
    @Query() query: any,
    @Res() res: Response,
  ) {
    if (!tenantId) {
      this.logger.error('Missing tenant ID in callback path');
      throw new Error('Tenant ID is required in path');
    }

    return this.handleCallback(query, tenantId, res);
  }

  /**
   * Shared callback handler for both query and path parameter versions.
   */
  private async handleCallback(
    query: any,
    tenantId: string,
    res: Response,
  ): Promise<void> {
    this.logger.debug('Handling Bluesky callback:', {
      tenantId,
      state: query.state,
      code: query.code,
    });

    const { redirectUrl, sessionId } =
      await this.authBlueskyService.handleAuthCallback(query, tenantId);

    // Set oidc_session cookie for cross-domain OIDC authentication
    if (sessionId) {
      const cookieOptions = getOidcCookieOptions();

      res.cookie('oidc_session', sessionId, cookieOptions);
      res.cookie('oidc_tenant', tenantId, cookieOptions);
    }

    res.redirect(redirectUrl);
  }

  /**
   * Client metadata - query parameter version (legacy)
   */
  @Public()
  @TenantPublic()
  @Get('client-metadata.json')
  @Header('Content-Type', 'application/json')
  async getClientMetadata(@Query('tenantId') tenantId: string) {
    const client = await this.authBlueskyService.initializeClient(tenantId);
    return client.clientMetadata;
  }

  /**
   * Client metadata - path parameter version (required for PDS compatibility).
   * The PDS strips query parameters when fetching client metadata,
   * so tenantId must be in the path.
   */
  @Public()
  @TenantPublic()
  @Get('t/:tenantId/client-metadata.json')
  @Header('Content-Type', 'application/json')
  async getClientMetadataWithPathTenant(@Param('tenantId') tenantId: string) {
    this.logger.debug('Client metadata request with path tenant', { tenantId });
    const client = await this.authBlueskyService.initializeClient(tenantId);
    return client.clientMetadata;
  }

  /**
   * JWKS - query parameter version (legacy)
   */
  @Public()
  @TenantPublic()
  @Get('jwks.json')
  @Header('Content-Type', 'application/json')
  async getJwks(@Query('tenantId') tenantId: string) {
    const client = await this.authBlueskyService.initializeClient(tenantId);
    return client.jwks;
  }

  /**
   * JWKS - path parameter version (required for PDS compatibility).
   * The PDS strips query parameters when fetching JWKS,
   * so tenantId must be in the path.
   */
  @Public()
  @TenantPublic()
  @Get('t/:tenantId/jwks.json')
  @Header('Content-Type', 'application/json')
  async getJwksWithPathTenant(@Param('tenantId') tenantId: string) {
    this.logger.debug('JWKS request with path tenant', { tenantId });
    const client = await this.authBlueskyService.initializeClient(tenantId);
    return client.jwks;
  }
}
