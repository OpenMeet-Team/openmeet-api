import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserEntity } from './infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class UserListener {

  @OnEvent('user.created')
  handleUserCreatedEvent(user: UserEntity) {
    console.log('user.created', user.id);
  }

  @OnEvent('user.updated')
  handleUserUpdatedEvent(user: UserEntity) {
    console.log('user.updated', user.id);
    // Matrix user information is managed directly through the Matrix API
  }
}
