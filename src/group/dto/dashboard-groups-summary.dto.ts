import { ApiProperty } from '@nestjs/swagger';
import { GroupEntity } from '../infrastructure/persistence/relational/entities/group.entity';

export class DashboardGroupCounts {
  @ApiProperty({ description: 'Groups where user is owner/admin/moderator' })
  leading: number;

  @ApiProperty({ description: 'Groups where user is a regular member' })
  member: number;
}

export class DashboardGroupsSummaryDto {
  @ApiProperty({ type: DashboardGroupCounts })
  counts: DashboardGroupCounts;

  @ApiProperty({
    type: [GroupEntity],
    description:
      'Groups user is leading (owner/admin/moderator) - limited preview',
  })
  leadingGroups: GroupEntity[];

  @ApiProperty({
    type: [GroupEntity],
    description: 'Groups user is a member of - limited preview',
  })
  memberGroups: GroupEntity[];
}
