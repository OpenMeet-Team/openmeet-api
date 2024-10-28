import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import zulipInit from 'zulip-js';
import { UserService } from './user.service';
import { Repository } from 'typeorm';
import { UserEntity } from './infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class UserCreatedListener {
  private usersRepository: Repository<UserEntity>;
  constructor(private readonly userService: UserService) {}
  @OnEvent('user.created')
  async handleUserCreatedEvent(event: any) {
    const config = { zuliprc: 'zuliprc-admin' };

    console.log('User created event received:', event);
    try {
      const client = await zulipInit(config);

      const response = await client.users.create(event);

      const user = await this.userService.findByEmail(event.email);
      if (response.result === 'success' && user) {
        user.zulipId = response.user_id;

        await this.usersRepository.save(user);
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      throw new NotFoundException('Failed to create user');
    }
  }
}
