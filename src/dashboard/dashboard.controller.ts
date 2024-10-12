import {
  Controller,
  Req,
  Get,
  Injectable,
  Scope,
  UseGuards,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JWTAuthGuard } from '../core/guards/auth.guard';
import { AuthGuard } from '@nestjs/passport';
import { ApiOkResponse } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
@Controller('dashboard')
@ApiTags('User Dashboard')
@UseGuards(AuthGuard('jwt'))
@Injectable({ scope: Scope.REQUEST, durable: true })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {
    this.dashboardService = dashboardService;
  }

  @ApiOperation({
    summary:
      'Get all events the authenticated user has created or is attending',
  })
  @ApiOkResponse({ description: 'List of user events' })
  @Get('my-events')
  async myEvents(@Req() req) {
    return await this.dashboardService.getMyEvents(req.user.id);
  }

  @ApiOperation({
    summary: 'Get all groups the authenticated user is a member of',
  })
  @ApiOkResponse({ description: 'List of user groups' })
  @Get('my-groups')
  async myGroups(@Req() req) {
    return await this.dashboardService.getMyGroups(req.user.id);
  }
}
