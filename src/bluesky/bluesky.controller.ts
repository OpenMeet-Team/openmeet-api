import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Param,
  UnprocessableEntityException,
  Req,
} from '@nestjs/common';
import { BlueskyService } from './bluesky.service';
import { JWTAuthGuard } from '../auth/auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { ConnectBlueskyDto } from '../auth-bluesky/dto/auth-bluesky-connect.dto';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { AuthBlueskyService } from '../auth-bluesky/auth-bluesky.service';
import { Logger } from '@nestjs/common';

@ApiTags('Bluesky')
@Controller('bluesky')
@UseGuards(JWTAuthGuard)
@ApiBearerAuth()
export class BlueskyController {
  private readonly logger = new Logger(BlueskyController.name);

  constructor(
    private readonly blueskyService: BlueskyService,
    private readonly authBlueskyService: AuthBlueskyService,
  ) {}

  @Post('connect')
  @ApiOperation({ summary: 'Connect Bluesky account' })
  async connect(@Body() connectDto: ConnectBlueskyDto) {
    return this.blueskyService.connectAccount(
      connectDto.identifier,
      connectDto.password,
      connectDto.tenantId,
    );
  }

  @Delete('disconnect')
  @ApiOperation({ summary: 'Disconnect Bluesky account' })
  async disconnect(@AuthUser() user: UserEntity) {
    return this.blueskyService.disconnectAccount(user);
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
    try {
      const events = await this.blueskyService.listEvents(did, req.tenantId);
      return { events };
    } catch (error) {
      this.logger.error('Failed to list Bluesky events:', error);
      throw new UnprocessableEntityException(
        'Failed to list Bluesky events. Please try again.',
      );
    }
  }
}
