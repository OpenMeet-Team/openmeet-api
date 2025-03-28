import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';

@Injectable()
export class GroupListener {
  constructor() {}

  @OnEvent('group.deleted')
  handleGroupDeletedEvent(group: GroupEntity) {
    console.log('group.deleted', group);
    // Matrix rooms are managed via the Matrix API now
  }

  @OnEvent('group.updated')
  handleGroupUpdatedEvent(group: GroupEntity) {
    console.log('group.updated', group);
  }

  @OnEvent('group.created')
  handleGroupCreatedEvent(group: GroupEntity) {
    console.log('group.created', group);
  }
}
