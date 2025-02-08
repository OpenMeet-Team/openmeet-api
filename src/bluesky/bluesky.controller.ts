import { Controller, Post, Get, Delete, Body, UseGuards } from '@nestjs/common';
import { BlueskyService } from './bluesky.service';
import { JWTAuthGuard } from '../auth/auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { ConnectBlueskyDto } from './dto/connect-bluesky.dto';
import { AuthUser } from '../core/decorators/auth-user.decorator';
@ApiTags('Bluesky')
@Controller('bluesky')
@UseGuards(JWTAuthGuard)
@ApiBearerAuth()
export class BlueskyController {
  constructor(private readonly blueskyService: BlueskyService) {}

  @Post('connect')
  @ApiOperation({ summary: 'Connect Bluesky account' })
  async connect(
    @Body() connectDto: ConnectBlueskyDto,
    @AuthUser() user: UserEntity,
  ) {
    return this.blueskyService.connectAccount(
      connectDto.identifier,
      connectDto.password,
      user,
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
}
