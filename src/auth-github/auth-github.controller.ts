import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  SerializeOptions,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { AuthGithubService } from './auth-github.service';
import { AuthGithubLoginDto } from './dto/auth-github-login.dto';
import { LoginResponseDto } from '../auth/dto/login-response.dto';
import { Request, Response } from 'express';
import { getOidcCookieOptions } from '../utils/cookie-config';
import { Public } from '../core/decorators/public.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { OAuthPlatform, parseOAuthState } from '../auth/types/oauth.types';

@ApiTags('Auth')
@Controller({
  path: 'auth/github',
  version: '1',
})
export class AuthGithubController {
  constructor(
    private readonly authService: AuthService,
    private readonly authGithubService: AuthGithubService,
  ) {}

  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @SerializeOptions({
    groups: ['me'],
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: AuthGithubLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const tenantId = request.headers['x-tenant-id'] as string;
    const socialData = await this.authGithubService.getProfileByToken(loginDto);

    const loginResult = await this.authService.validateSocialLogin(
      'github',
      socialData,
      tenantId,
    );

    // Set oidc_session cookie for cross-domain OIDC authentication
    if (loginResult.sessionId) {
      const cookieOptions = getOidcCookieOptions();

      response.cookie('oidc_session', loginResult.sessionId, cookieOptions);
      response.cookie('oidc_tenant', tenantId, cookieOptions);
    }

    return loginResult;
  }

  /**
   * GET callback endpoint for server-side OAuth flow.
   * GitHub redirects here after user authorizes.
   * This endpoint exchanges the code for tokens and redirects to the frontend.
   * For mobile platforms, redirects to custom URL scheme.
   *
   * The state parameter contains base64-encoded JSON with tenantId, platform, and nonce.
   */
  @Public()
  @TenantPublic()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    // Parse tenantId and platform from state parameter
    const stateData = parseOAuthState(state);
    const tenantId = stateData?.tenantId;
    const platform: OAuthPlatform | undefined = stateData?.platform;

    if (!tenantId) {
      // Redirect to error page if tenant not found in state
      res.redirect('/auth/error?message=Missing+tenant+information');
      return;
    }

    const { redirectUrl, sessionId } =
      await this.authGithubService.handleCallback(
        code,
        state,
        tenantId,
        platform,
      );

    // Set oidc_session cookie for cross-domain OIDC authentication
    if (sessionId) {
      const cookieOptions = getOidcCookieOptions();
      res.cookie('oidc_session', sessionId, cookieOptions);
      res.cookie('oidc_tenant', tenantId, cookieOptions);
    }

    res.redirect(redirectUrl);
  }
}
