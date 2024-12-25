import {
  Controller,
  Get,
  Query,
  Res,
  Header,
} from '@nestjs/common';
import { AuthBlueskyService } from './auth-bluesky.service';
import { Response } from 'express';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { LoginResponseDto } from '../auth/dto/login-response.dto';
import { TenantConfig } from '../core/constants/constant';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Public } from '../core/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import { TenantPublic } from '../tenant/tenant-public.decorator';
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
    private readonly configService: ConfigService,
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
    const tenantConfig: TenantConfig =
      await this.tenantConnectionService.getTenantConfig(tenantId);
    try {
      console.log('going to initialize client');
      await this.authBlueskyService.initializeClient(tenantId);
      console.log('client initialized');
      console.log('going to initiate login');
      const { url } = await this.authBlueskyService.initiateLogin(
        handle,
        tenantId,
      );
      console.log('login initiated:', url);
      res.redirect(url.toString());
    } catch (error) {
      console.error('Login error:', error);
      const frontendUrl = tenantConfig.frontendDomain;
      res.redirect(
        `${frontendUrl}/auth/error?message=${encodeURIComponent(error.message)}`,
      );
    }
  }

  @Public()
  @TenantPublic()
  @Get('callback')
  async callback(@Query() query: any, @Res() res: Response) {
    const redirectUrl = await this.authBlueskyService.handleAuthCallback(query);
    res.redirect(redirectUrl);
  }

  @Public()
  @TenantPublic()
  @Get('client-metadata.json')
  @Header('Content-Type', 'application/json')
  async getClientMetadata(@Query('tenantId') tenantId: string) {
    if (!this.authBlueskyService.getClient()) {
      await this.authBlueskyService.initializeClient(tenantId);
    }
    return this.authBlueskyService.getClient().clientMetadata;
  }

  @Public()
  @TenantPublic()
  @Get('jwks.json')
  @Header('Content-Type', 'application/json')
  async getJwks(@Query('tenantId') tenantId: string) {
    if (!this.authBlueskyService.getClient()) {
      await this.authBlueskyService.initializeClient(tenantId);
    }
    return this.authBlueskyService.getClient().jwks;
  }
}
