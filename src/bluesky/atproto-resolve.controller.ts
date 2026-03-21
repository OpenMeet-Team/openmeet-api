import {
  Controller,
  Get,
  Inject,
  Param,
  Req,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { EventQueryService } from '../event/services/event-query.service';

const SUPPORTED_COLLECTIONS = ['community.lexicon.calendar.event'];

@ApiTags('ATProto')
@Controller('atproto')
export class AtprotoResolveController {
  private readonly logger = new Logger(AtprotoResolveController.name);

  constructor(
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    private readonly configService: ConfigService,
  ) {}

  private getFrontendDomain(): string {
    const frontendDomain = this.configService.get<string>(
      'app.frontendDomain',
      { infer: true },
    );
    if (!frontendDomain) {
      throw new Error('FRONTEND_DOMAIN environment variable is not configured');
    }
    return frontendDomain;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('resolve/:did/:collection/:rkey')
  @ApiOperation({
    summary: 'Resolve an AT URI to an OpenMeet resource URL',
    description:
      'Given path params that form an AT URI (at://{did}/{collection}/{rkey}), returns the OpenMeet URL for the matching event.',
  })
  async resolve(
    @Param('did') did: string,
    @Param('collection') collection: string,
    @Param('rkey') rkey: string,
    @Req() req: any,
  ) {
    const atUri = `at://${did}/${collection}/${rkey}`;
    const tenantId = req.tenantId;

    this.logger.debug(`Resolving AT URI: ${atUri} for tenant: ${tenantId}`);

    if (!SUPPORTED_COLLECTIONS.includes(collection)) {
      throw new NotFoundException(
        `Unsupported collection: ${collection}. Supported: ${SUPPORTED_COLLECTIONS.join(', ')}`,
      );
    }

    // First, check for OpenMeet-published events (atprotoUri field)
    const nativeEvents = await this.eventQueryService.findByAtprotoUri(
      atUri,
      tenantId,
    );

    if (nativeEvents.length > 0) {
      const event = nativeEvents[0];
      const frontendDomain = this.getFrontendDomain();
      return {
        url: `${frontendDomain}/events/${event.slug}`,
        slug: event.slug,
        type: 'event',
      };
    }

    // Second, check for firehose-ingested events (sourceType='bluesky', sourceId=AT URI)
    const ingestedEvents = await this.eventQueryService.findBySourceAttributes(
      atUri,
      'bluesky',
      tenantId,
    );

    if (ingestedEvents.length > 0) {
      const event = ingestedEvents[0];
      const frontendDomain = this.getFrontendDomain();
      return {
        url: `${frontendDomain}/events/${event.slug}`,
        slug: event.slug,
        type: 'event',
      };
    }

    throw new NotFoundException(
      `No OpenMeet resource found for AT URI: ${atUri}`,
    );
  }
}
