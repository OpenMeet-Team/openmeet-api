import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserService } from './user.service';
import { ZulipService } from '../zulip/zulip.service';
import { UserEntity } from './infrastructure/persistence/relational/entities/user.entity';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class UserListener {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
    private readonly zulipService: ZulipService,
  ) {}

  @OnEvent('user.created')
  handleUserCreatedEvent(user: UserEntity) {
    console.log('user.created', user.id);
  }

  @OnEvent('user.updated')
  async handleUserUpdatedEvent(user: UserEntity) {
    console.log('user.updated', user.id);

    if (user.zulipUsername && user.zulipApiKey) {
      try {
        await this.zulipService.updateAdminProfile(user, {
          full_name: `${user.firstName} ${user.lastName}`.trim() || 'Anonymous',
        });
      } catch (error) {
        console.error('Failed to update zulip user settings:', error);
        throw new Error('Failed to update zulip user settings');
      }
    }
  }
}
