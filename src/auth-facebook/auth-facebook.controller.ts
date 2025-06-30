import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  SerializeOptions,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { AuthFacebookService } from './auth-facebook.service';
import { AuthFacebookLoginDto } from './dto/auth-facebook-login.dto';
import { LoginResponseDto } from '../auth/dto/login-response.dto';
import { Request, Response } from 'express';

@ApiTags('Auth')
@Controller({
  path: 'auth/facebook',
  version: '1',
})
export class AuthFacebookController {
  constructor(
    private readonly authService: AuthService,
    private readonly authFacebookService: AuthFacebookService,
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
    @Body() loginDto: AuthFacebookLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const tenantId = request.headers['x-tenant-id'] as string;
    const socialData =
      await this.authFacebookService.getProfileByToken(loginDto);

    const loginResult = await this.authService.validateSocialLogin(
      'facebook',
      socialData,
      tenantId,
    );

    // Set oidc_session cookie for cross-domain OIDC authentication
    if (loginResult.sessionId) {
      response.cookie('oidc_session', loginResult.sessionId, {
        domain: '.openmeet.net', // Cross-subdomain sharing
        secure: true, // HTTPS only
        sameSite: 'lax', // Allow cross-site requests
        httpOnly: true, // Security
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    }

    return loginResult;
  }
}
