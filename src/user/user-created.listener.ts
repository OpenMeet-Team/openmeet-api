import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserService } from './user.service';
import { ZulipService } from '../zulip/zulip.service';

@Injectable()
export class UserCreatedListener {
  constructor(
    private readonly userService: UserService,
    private readonly zulipService: ZulipService,
  ) {}
  @OnEvent('user.created')
  async handleUserCreatedEvent(event: any) {
    try {
      await this.userService.getTenantSpecificRepository();
      const response = await this.zulipService.CreateZulipUser(event);
      if (response.result === 'success') {
        const emailParts = event.email.split('_');
        const actualEmail = emailParts.slice(1).join('_');

        await this.userService.addZulipIdInUser(actualEmail, response.user_id);
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      throw new NotFoundException('Failed to create user');
    }
    console.log(
      '🚀 ~ UserCreatedListener ~ handleUserCreatedEvent ~ console:',
      console,
    );
  }
}
