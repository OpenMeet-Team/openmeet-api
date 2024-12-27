import {
  Controller,
  Get,
  Query,
  Res,
  Header,
  HttpStatus,
  HttpCode,
  Post,
  Body,
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
import { AuthBlueskyLoginDto } from './dto/auth-bluesky-login.dto';
import { AuthService } from '../auth/auth.service';

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
    private readonly authService: AuthService,
  ) {}

  @Public()
  @TenantPublic()
  @Get('callback')
  async callback(@Query() query: any, @Res() res: Response) {
    const effectiveTenantId = query.tenantId;

    const redirectUrl = await this.authBlueskyService.handleAuthCallback(
      query,
      effectiveTenantId,
    );
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

  @Get('authorize')
  @Public()
  @TenantPublic()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: String })
  async getAuthUrl(
    @Query('handle') handle: string,
    @Query('tenantId') tenantId: string,
  ) {
    const url = await this.authBlueskyService.createAuthUrl(handle, tenantId);
    return { url };
  }

  // @Post('login')
  // @Public()
  // @TenantPublic()
  // @HttpCode(HttpStatus.OK)
  // @ApiOkResponse({ type: LoginResponseDto })
  // async login(
  //   @Body() loginDto: AuthBlueskyLoginDto,
  // ): Promise<LoginResponseDto> {
  //   const socialData =
  //     await this.authBlueskyService.getProfileByToken(loginDto);

  //   return this.authService.validateSocialLogin(
  //     'bluesky',
  //     socialData,
  //     loginDto.tenantId,
  //   );
  // }
}
