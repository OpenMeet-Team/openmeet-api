import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JWTAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { DIDApiService } from './did-api.service';
import { DIDEventsQueryDto } from './dto/did-events-query.dto';

@ApiTags('DID API')
@Controller('v1/did')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class DIDApiController {
  constructor(private readonly didApiService: DIDApiService) {}

  @Get('groups')
  @ApiOperation({
    summary: 'Get groups the authenticated user belongs to',
    description:
      'Returns all groups where the user has an active membership, with role and counts.',
  })
  async getMyGroups(@AuthUser() user: User) {
    return this.didApiService.getMyGroups(user.id);
  }

  @Get('events')
  @ApiOperation({
    summary: 'Get events the authenticated user has access to',
    description:
      'Returns private/unlisted events in user groups and events the user is attending.',
  })
  async getMyEvents(@AuthUser() user: User, @Query() query: DIDEventsQueryDto) {
    return this.didApiService.getMyEvents(user.id, query);
  }

  @Get('events/:slug')
  @ApiOperation({
    summary: 'Get event detail with permission check',
    description:
      'Returns event detail. Returns 403 if user lacks access, 404 if not found.',
  })
  async getEventBySlug(@AuthUser() user: User, @Param('slug') slug: string) {
    return this.didApiService.getEventBySlug(user.id, slug);
  }
}
