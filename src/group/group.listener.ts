import { Injectable } from '@nestjs/common';
import { MatrixService } from '../matrix/matrix.service';
import { OnEvent } from '@nestjs/event-emitter';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';

@Injectable()
export class GroupListener {
  constructor(private readonly matrixService: MatrixService) {}

  @OnEvent('group.deleted')
  handleGroupDeletedEvent(group: GroupEntity) {
    console.log('group.deleted', group);

    if (group.matrixRoomId) {
      // TODO: Implement room deletion in MatrixService
      // this.matrixService.deleteRoom(group.matrixRoomId);
      console.log(`Matrix room ${group.matrixRoomId} should be deleted`);
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
