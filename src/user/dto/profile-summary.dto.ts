import { ApiProperty } from '@nestjs/swagger';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { FileEntity } from '../../file/infrastructure/persistence/relational/entities/file.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupMemberEntity } from '../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { SubCategoryEntity } from '../../sub-category/infrastructure/persistence/relational/entities/sub-category.entity';

export class ProfileCounts {
  @ApiProperty({ description: 'Number of public events organized by user' })
  organizedEvents: number;

  @ApiProperty({ description: 'Number of public events user is attending' })
  attendingEvents: number;

  @ApiProperty({ description: 'Number of public groups owned by user' })
  ownedGroups: number;

  @ApiProperty({ description: 'Number of public group memberships' })
  groupMemberships: number;
}

export class ProfileSummaryDto {
  @ApiProperty({ description: 'User ID' })
  id: number;

  @ApiProperty({ description: 'User slug' })
  slug: string;

  @ApiProperty({ description: 'User first name', required: false })
  firstName?: string;

  @ApiProperty({ description: 'User last name', required: false })
  lastName?: string;

  @ApiProperty({ description: 'User bio', required: false })
  bio?: string;

  @ApiProperty({ description: 'User photo', required: false, type: FileEntity })
  photo?: FileEntity | null;

  @ApiProperty({ description: 'Auth provider' })
  provider?: string;

  @ApiProperty({
    description: 'Social ID (e.g., Bluesky DID)',
    required: false,
  })
  socialId?: string;

  @ApiProperty({ description: 'Whether this is a shadow account' })
  isShadowAccount?: boolean;

  @ApiProperty({ description: 'User preferences', required: false })
  preferences?: Record<string, unknown>;

  @ApiProperty({ type: ProfileCounts })
  counts: ProfileCounts;

  @ApiProperty({
    type: [SubCategoryEntity],
    description: 'User interests',
  })
  interests: SubCategoryEntity[];

  @ApiProperty({
    type: [EventEntity],
    description: 'Recent organized events - limited preview',
  })
  organizedEvents: EventEntity[];

  @ApiProperty({
    type: [EventEntity],
    description: 'Recent attending events - limited preview',
  })
  attendingEvents: EventEntity[];

  @ApiProperty({
    type: [GroupEntity],
    description: 'Owned groups - limited preview',
  })
  ownedGroups: GroupEntity[];

  @ApiProperty({
    type: [GroupMemberEntity],
    description: 'Group memberships - limited preview',
  })
  groupMemberships: GroupMemberEntity[];
}
