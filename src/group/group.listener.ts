import { Injectable } from '@nestjs/common';
import { ZulipService } from '../zulip/zulip.service';
import { OnEvent } from '@nestjs/event-emitter';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';

@Injectable()
export class GroupListener {
  constructor(private readonly zulipService: ZulipService) {}

  @OnEvent('group.deleted')
  handleGroupDeletedEvent(group: GroupEntity) {
    console.log('group.deleted', group);

    if (group.zulipChannelId) {
      this.zulipService.deleteChannel(group.zulipChannelId);
    }
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
