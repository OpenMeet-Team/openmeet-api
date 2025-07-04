import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Headers,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { AllConfigType } from '../../config/config.type';
import { TenantPublic } from '../../tenant/tenant-public.decorator';

@ApiTags('Matrix Application Service')
@TenantPublic()
@Controller('matrix/appservice')
export class MatrixAppServiceController {
  private readonly logger = new Logger(MatrixAppServiceController.name);

  private readonly appServiceToken: string;
  private readonly homeserverToken: string;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const matrixConfig = this.configService.get('matrix', { infer: true })!;

    this.appServiceToken = matrixConfig.appservice.token;
    this.homeserverToken = matrixConfig.appservice.hsToken;

    this.logger.log('Matrix Application Service configured successfully');
  }

  @Get('users/:userId')
  queryUser(
    @Param('userId') userId: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.logger.debug(`Query user request for: ${userId}`);

    // Validate authorization token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Invalid authorization header format for user query: ${userId}`,
      );
      return { error: 'Invalid token' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== this.homeserverToken) {
      this.logger.warn(`Invalid token for user query: ${userId}`);
      return { error: 'Invalid token' };
    }

    // For now, accept all users in our namespace
    if (userId.includes('openmeet-bot-') || userId.includes('openmeet-')) {
      this.logger.log(`Accepting user: ${userId}`);
      return {}; // Empty response = success
    }

    this.logger.warn(`Rejecting user outside namespace: ${userId}`);
    return { error: 'User not in namespace' };
  }

  @Get('rooms/:roomAlias')
  queryRoom(
    @Param('roomAlias') roomAlias: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.logger.debug(`Query room request for: ${roomAlias}`);

    // Validate authorization token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Invalid authorization header format for room query: ${roomAlias}`,
      );
      return { error: 'Invalid token' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== this.homeserverToken) {
      this.logger.warn(`Invalid token for room query: ${roomAlias}`);
      return { error: 'Invalid token' };
    }

    // For now, reject all room queries as we don't auto-create rooms
    this.logger.warn(`Rejecting room query: ${roomAlias}`);
    return { error: 'Room not found' };
  }

  @Put('_matrix/app/v1/transactions/:txnId')
  handleTransaction(
    @Param('txnId') txnId: string,
    @Body() events: any[],
    @Headers('authorization') authHeader: string,
  ) {
    this.logger.debug(`Transaction ${txnId} with ${events.length} events`);

    // Validate authorization token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `Invalid authorization header format for transaction: ${txnId}`,
      );
      return { error: 'Invalid token' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (token !== this.homeserverToken) {
      this.logger.warn(`Invalid token for transaction: ${txnId}`);
      return { error: 'Invalid token' };
    }

    // Process events
    for (const event of events) {
      this.logger.log(`Processing event: ${event.type} from ${event.sender}`);

      // Handle different event types
      switch (event.type) {
        case 'm.room.message':
          this.logger.debug(`Message event: ${event.content?.body}`);
          break;
        case 'm.room.member':
          this.logger.debug(`Member event: ${event.content?.membership}`);
          break;
        default:
          this.logger.debug(`Unknown event type: ${event.type}`);
      }
    }

    return {}; // Empty response = success
  }

  @Get('_matrix/app/v1/thirdparty/protocol/:protocol')
  getProtocol(@Param('protocol') protocol: string) {
    this.logger.debug(`Protocol query for: ${protocol}`);
    return {}; // No third-party protocols supported
  }

  @Get('_matrix/app/v1/thirdparty/location/:alias')
  getLocation(@Param('alias') alias: string) {
    this.logger.debug(`Location query for: ${alias}`);
    return []; // No third-party locations supported
  }

  @Get('_matrix/app/v1/thirdparty/user/:userid')
  getThirdPartyUser(@Param('userid') userid: string) {
    this.logger.debug(`Third-party user query for: ${userid}`);
    return []; // No third-party users supported
  }
}
