import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import { AuthBlueskyService } from './auth-bluesky.service';
import { Response } from 'express';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { LoginResponseDto } from '../auth/dto/login-response.dto';
import { TenantConfig } from '../core/constants/constant';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Public } from '../core/decorators/public.decorator';
@ApiTags('Auth')
@Controller({
  path: 'auth/bluesky',
  version: '1',
})
export class AuthBlueskyController {
  private tenantConfig: TenantConfig;
  constructor(
    private readonly authBlueskyService: AuthBlueskyService,
    private readonly jwtService: JwtService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @Public()
  @Get('login')
  async login(
    @Query('handle') handle: string,
    @Query('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    try {
      console.log('tenantId', tenantId);
      this.tenantConfig =
        this.tenantConnectionService.getTenantConfig(tenantId);
    } catch (error) {
      throw new Error(error.message);
    }
    try {
      const url = await this.authBlueskyService.authorize(handle);
      res.redirect(url.toString());
    } catch (error) {
      res.redirect('/auth/error?message=' + error.message);
    }
  }

  @Public()
  @Get('callback')
  async callback(@Query() query: any, @Res() res: Response) {
    try {
      const profile = await this.authBlueskyService.handleCallback(
        new URLSearchParams(query),
      );

      // Generate JWT token for the authenticated user
      const token = this.jwtService.sign({
        did: profile.did,
        handle: profile.handle,
        displayName: profile.displayName,
      });

      res.redirect(
        `/api/v1/auth/success?token=${token}&profile=${JSON.stringify(profile)}`,
      );
    } catch (error) {
      res.redirect('/api/v1/auth/error?message=' + error.message);
    }
  }
  @Public()
  @Get('client-metadata.json')
  getClientMetadata() {
    return this.authBlueskyService.getClient().clientMetadata;
  }

  @Public()
  @Get('jwks.json')
  getJwks() {
    return this.authBlueskyService.getClient().jwks;
  }
}
