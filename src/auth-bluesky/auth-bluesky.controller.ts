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
  Logger,
} from '@nestjs/common';
import { AuthBlueskyService } from './auth-bluesky.service';
import { Response } from 'express';
import { ApiOkResponse, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../core/decorators/public.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { ConnectBlueskyDto } from './dto/auth-bluesky-connect.dto';

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
  ) {
    return await this.authBlueskyService.createAuthUrl(handle, tenantId);
  }

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

  @Post('dev-login')
  @Public()
  @TenantPublic()
  @ApiOperation({
    summary: '[DEV ONLY] Login with Bluesky credentials directly',
  })
  async devLogin(@Body() connectDto: ConnectBlueskyDto) {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      throw new Error('This endpoint is only available in development');
    }

    return this.authBlueskyService.handleDevLogin(connectDto);
  }
}
