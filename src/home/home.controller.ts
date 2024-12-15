import { Controller, Get, Query, Redirect, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { HomeService } from './home.service';
import { Public } from '../auth/decorators/public.decorator';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { HomeQuery } from './dto/home-query.dto';
import { TenantPublic } from 'src/tenant/tenant-public.decorator';

@ApiTags('Home')
@Controller()
export class HomeController {
  constructor(private service: HomeService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Redirect to platform or API docs' })
  @Redirect()
  rootRedirect() {
    return this.service.getRootRedirect();
  }

  @Public()
  @TenantPublic()
  @Get('version')
  @ApiOperation({ summary: 'Get API version information' })
  getApiInfo() {
    return this.service.getAppInfo();
  }

  @Get('home/guest')
  @ApiOperation({ summary: 'Get guest home state' })
  getGuestHomeState() {
    return this.service.getGuestHomeState();
  }

  @Get('home/search')
  @ApiOperation({ summary: 'Search Event and Group' })
  searchEventGroup(
    @Query() pagination: PaginationDto,
    @Query() query: HomeQuery,
  ) {
    return this.service.globalSearch(pagination, query);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('home/user')
  @ApiOperation({ summary: 'Get user home state' })
  getUserHomeState(@AuthUser() user: UserEntity) {
    return this.service.getUserHomeState(user);
  }
}
