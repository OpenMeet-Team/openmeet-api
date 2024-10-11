import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../config/config.type';
import { UsersService } from '../users/users.service';
import { GroupService } from '../groups/groups.service';

@Injectable()
export class HomeService {
  constructor(
    private configService: ConfigService<AllConfigType>,
    private userService: UsersService,
    private groupService: GroupService,
  ) {}

  appInfo() {
    return { name: this.configService.get('app.name', { infer: true }) };
  }
}
