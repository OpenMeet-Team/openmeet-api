import { Controller, Get, Redirect, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { HomeService } from './home.service';
import { Public } from '../auth/decorators/public.decorator';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../core/decorators/auth-user.decorator';

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
  @Get('version')
  @ApiOperation({ summary: 'Get API information' })
  getApiInfo() {
    return this.service.getAppInfo();
  }

  @Get('home/guest')
  @ApiOperation({ summary: 'Get guest home state' })
  getGuestHomeState() {
    return this.service.getGuestHomeState();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('home/user')
  @ApiOperation({ summary: 'Get user home state' })
  getUserHomeState(@AuthUser() user: UserEntity) {
    return this.service.getUserHomeState(user);
  }
}
