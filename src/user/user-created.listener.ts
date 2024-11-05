import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserService } from './user.service';
import { Repository } from 'typeorm';
import { UserEntity } from './infrastructure/persistence/relational/entities/user.entity';
import { ZulipService } from '../zulip/zulip.service';

@Injectable()
export class UserCreatedListener {
  private usersRepository: Repository<UserEntity>;
  constructor(
    private readonly userService: UserService,
    private readonly zulipService: ZulipService,
  ) {}
  @OnEvent('user.created')
  async handleUserCreatedEvent(event: any) {
    try {
      const response = await this.zulipService.CreateZulipUser(event);

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
