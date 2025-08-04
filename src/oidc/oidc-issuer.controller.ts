import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { TenantPublic } from '../tenant/tenant-public.decorator';
import { OidcService } from './services/oidc.service';

@ApiTags('OIDC Issuer')
@Controller()
export class OidcIssuerController {
  constructor(private readonly oidcService: OidcService) {}

  @ApiOperation({
    summary: 'OIDC Discovery Document (Issuer Path)',
    description:
      'OpenID Connect discovery endpoint at the issuer path (/oidc/.well-known/openid-configuration) for OIDC spec compliance',
  })
  @Get('oidc/.well-known/openid-configuration')
  @TenantPublic()
  getIssuerDiscoveryDocument(@Req() request: Request) {
    // Extract the base URL from the request
    const protocol = request.get('x-forwarded-proto') || request.protocol;
    const host = request.get('x-forwarded-host') || request.get('host');
    const baseUrl = `${protocol}://${host}`;

    return this.oidcService.getDiscoveryDocument(baseUrl);
  }
}
