import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserService } from './user.service';
import { UserEntity } from './infrastructure/persistence/relational/entities/user.entity';
import { REQUEST } from '@nestjs/core';

@Injectable()
export class UserListener {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
  ) {}

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
