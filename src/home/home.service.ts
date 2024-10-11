import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../config/config.type';
import { UserService } from '../user/user.service';
import { GroupService } from '../group/group.service';

@Injectable()
export class HomeService {
  constructor(
    private configService: ConfigService<AllConfigType>,
    private userService: UserService,
    private groupService: GroupService,
  ) {}

  appInfo() {
    return { name: this.configService.get('app.name', { infer: true }) };
  }
}
