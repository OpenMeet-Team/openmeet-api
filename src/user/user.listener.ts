import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  async handleUserCreatedEvent(user: UserEntity) {
    try {
      await this.userService.getTenantSpecificRepository();
      await this.zulipService.getInitialisedClient(user); // this will create a new zulip user if it doesn't exist
    } catch (error) {
      console.error('UserListener: Failed to create zulip user', error.message);
    }
  }

  @OnEvent('user.updated')
  async handleUserUpdatedEvent(user: UserEntity) {
    try {
      await this.zulipService.getInitialisedClient(user);
      await this.zulipService.updateUserSettings(user, {
        full_name: user.name,
      });
    } catch (error) {
      console.error('Failed to create or update zulip user:', error);
      throw new NotFoundException('Failed to create or update zulip user');
    }
  }
}
