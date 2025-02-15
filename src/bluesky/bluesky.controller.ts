import {
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  Param,
  Req,
  Logger,
} from '@nestjs/common';
import { BlueskyService } from './bluesky.service';
import { JWTAuthGuard } from '../auth/auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AuthUser } from '../core/decorators/auth-user.decorator';

@ApiTags('Bluesky')
@Controller('bluesky')
@UseGuards(JWTAuthGuard)
@ApiBearerAuth()
export class BlueskyController {
  private readonly logger = new Logger(BlueskyController.name);

  constructor(private readonly blueskyService: BlueskyService) {}

  @Post('connect')
  @ApiOperation({ summary: 'Enable Bluesky event source' })
  async connect(@AuthUser() user: UserEntity, @Req() req) {
    return this.blueskyService.connectAccount(user, req.tenantId);
  }

  @Delete('disconnect')
  @ApiOperation({ summary: 'Disconnect Bluesky account' })
  async disconnect(@AuthUser() user: UserEntity, @Req() req) {
    return this.blueskyService.disconnectAccount(user, req.tenantId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get Bluesky connection status' })
  getStatus(@AuthUser() user: UserEntity) {
    return this.blueskyService.getConnectionStatus(user);
  }

  @Get('events/:did')
  @ApiOperation({ summary: 'List Bluesky events' })
  @UseGuards(JWTAuthGuard)
  async listEvents(@Req() req, @Param('did') did: string) {
    return await this.blueskyService.listEvents(did, req.tenantId);
  }

  @Delete('events/:did/:rkey')
  @ApiOperation({ summary: 'Delete Bluesky event' })
  async deleteEvent(
    @Req() req,
    @Param('did') did: string,
    @Param('rkey') rkey: string,
  ) {
    return this.blueskyService.deleteEventRecord(
      { sourceType: 'bluesky', sourceId: did, sourceData: { rkey } } as any,
      did,
      req.tenantId,
    );
  }
}
