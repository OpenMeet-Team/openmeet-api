import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TenantPublic } from '../tenant/tenant-public.decorator';

@ApiTags('DID')
@Controller({ path: '.well-known', version: VERSION_NEUTRAL })
export class DidWebController {
  constructor(private readonly configService: ConfigService) {}

  @Get('did.json')
  @Public()
  @TenantPublic()
  @ApiOperation({ summary: 'DID document for AT Protocol service auth' })
  @ApiOkResponse({
    description: 'DID document identifying this OpenMeet instance',
  })
  getDidDocument() {
    const serviceDid =
      this.configService.get<string>('SERVICE_DID', { infer: true }) ||
      'did:web:api.openmeet.net';
    const serviceEndpoint =
      this.configService.get<string>('BACKEND_DOMAIN', { infer: true }) ||
      'https://api.openmeet.net';

    return {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: serviceDid,
      service: [
        {
          id: '#openmeet',
          type: 'OpenMeetService',
          serviceEndpoint,
        },
      ],
    };
  }
}
