import {
  Injectable,
  Inject,
  Scope,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupDIDFollowEntity } from './infrastructure/persistence/relational/entities/group-did-follow.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { CreateGroupDIDFollowDto } from './dto/create-group-did-follow.dto';
import { GroupDIDFollowResponseDto } from './dto/group-did-follow-response.dto';
import { Trace } from '../utils/trace.decorator';
import { GroupRole } from '../core/constants/constant';

@Injectable({ scope: Scope.REQUEST })
export class GroupDIDFollowService {
  private readonly logger = new Logger(GroupDIDFollowService.name);

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private get tenantId(): string {
    return this.request.tenantId;
  }

  private async getRepositories(): Promise<{
    followRepo: Repository<GroupDIDFollowEntity>;
    groupRepo: Repository<GroupEntity>;
    memberRepo: Repository<GroupMemberEntity>;
  }> {
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      this.tenantId,
    );
    return {
      followRepo: dataSource.getRepository(GroupDIDFollowEntity),
      groupRepo: dataSource.getRepository(GroupEntity),
      memberRepo: dataSource.getRepository(GroupMemberEntity),
    };
  }

  @Trace()
  async addFollow(
    groupSlug: string,
    dto: CreateGroupDIDFollowDto,
    userId: number,
  ): Promise<GroupDIDFollowResponseDto> {
    const { followRepo, groupRepo, memberRepo } = await this.getRepositories();

    const group = await groupRepo.findOne({ where: { slug: groupSlug } });
    if (!group) {
      throw new NotFoundException(`Group not found: ${groupSlug}`);
    }

    await this.assertOwnerOrAdmin(memberRepo, group.id, userId);

    const existing = await followRepo.findOne({
      where: { group: { id: group.id }, did: dto.did },
    });
    if (existing) {
      throw new ConflictException(
        `DID ${dto.did} is already followed by this group`,
      );
    }

    const entity = followRepo.create({
      group: { id: group.id } as GroupEntity,
      did: dto.did,
      createdBy: { id: userId } as any,
    });

    const saved = await followRepo.save(entity);
    this.logger.log(
      `Added DID follow: group=${groupSlug}, did=${dto.did}, by user=${userId}`,
    );

    return new GroupDIDFollowResponseDto(saved);
  }

  @Trace()
  async removeFollow(
    groupSlug: string,
    did: string,
    userId: number,
  ): Promise<void> {
    const { followRepo, groupRepo, memberRepo } = await this.getRepositories();

    const group = await groupRepo.findOne({ where: { slug: groupSlug } });
    if (!group) {
      throw new NotFoundException(`Group not found: ${groupSlug}`);
    }

    await this.assertOwnerOrAdmin(memberRepo, group.id, userId);

    const follow = await followRepo.findOne({
      where: { group: { id: group.id }, did },
    });
    if (!follow) {
      throw new NotFoundException(
        `DID follow not found: ${did} in group ${groupSlug}`,
      );
    }

    await followRepo.remove(follow);
    this.logger.log(
      `Removed DID follow: group=${groupSlug}, did=${did}, by user=${userId}`,
    );
  }

  @Trace()
  async listFollows(
    groupSlug: string,
    userId: number,
  ): Promise<GroupDIDFollowResponseDto[]> {
    const { followRepo, groupRepo, memberRepo } = await this.getRepositories();

    const group = await groupRepo.findOne({ where: { slug: groupSlug } });
    if (!group) {
      throw new NotFoundException(`Group not found: ${groupSlug}`);
    }

    await this.assertOwnerOrAdmin(memberRepo, group.id, userId);

    const follows = await followRepo.find({
      where: { group: { id: group.id } },
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });

    return follows.map((f) => new GroupDIDFollowResponseDto(f));
  }

  @Trace()
  async getFollowedDidsForGroup(groupId: number): Promise<string[]> {
    const { followRepo } = await this.getRepositories();

    const follows = await followRepo.find({
      where: { group: { id: groupId } },
      select: ['did'],
    });

    return follows.map((f) => f.did);
  }

  private async assertOwnerOrAdmin(
    memberRepo: Repository<GroupMemberEntity>,
    groupId: number,
    userId: number,
  ): Promise<void> {
    const member = await memberRepo.findOne({
      where: { group: { id: groupId }, user: { id: userId } },
      relations: ['groupRole'],
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this group');
    }

    const role = member.groupRole?.name;
    if (role !== GroupRole.Owner && role !== GroupRole.Admin) {
      throw new ForbiddenException(
        'Only group owners and admins can manage DID follows',
      );
    }
  }
}
