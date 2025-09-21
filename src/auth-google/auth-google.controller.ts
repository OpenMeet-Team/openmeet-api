import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  SerializeOptions,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { AuthGoogleService } from './auth-google.service';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { AuthGoogleOAuth2Dto } from './dto/auth-google-oauth2.dto';
import { LoginResponseDto } from '../auth/dto/login-response.dto';
import { Request, Response } from 'express';
import { getOidcCookieOptions } from '../utils/cookie-config';

@ApiTags('Auth')
@Controller({
  path: 'auth/google',
  version: '1',
})
export class AuthGoogleController {
  constructor(
    private readonly authService: AuthService,
    private readonly authGoogleService: AuthGoogleService,
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
    @Body() loginDto: AuthGoogleLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const tenantId = request.headers['x-tenant-id'] as string;
    const socialData = await this.authGoogleService.getProfileByToken(loginDto);

    const loginResult = await this.authService.validateSocialLogin(
      'google',
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

  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @SerializeOptions({
    groups: ['me'],
  })
  @Post('oauth2/callback')
  @HttpCode(HttpStatus.OK)
  async oauth2Callback(
    @Body() oauth2Dto: AuthGoogleOAuth2Dto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const tenantId = request.headers['x-tenant-id'] as string;

    // Get profile using OAuth2 code (new method)
    const socialData = await this.authGoogleService.getProfileByOAuth2Code(oauth2Dto);

    // Reuse existing social login validation
    const loginResult = await this.authService.validateSocialLogin(
      'google',
      socialData,
      tenantId,
    );

    // Reuse existing cookie logic
    if (loginResult.sessionId) {
      const cookieOptions = getOidcCookieOptions();
      response.cookie('oidc_session', loginResult.sessionId, cookieOptions);
      response.cookie('oidc_tenant', tenantId, cookieOptions);
    }

    return loginResult;
  }
}
