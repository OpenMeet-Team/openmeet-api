import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { groupSeedData } from './group-seed.seed';
import { GroupEntity } from '../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { CategoryEntity } from '../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import slugify from 'slugify';
import { GroupMemberEntity } from '../../../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupRole } from '../../../../core/constants/constant';
import { GroupRoleEntity } from '../../../../group-role/infrastructure/persistence/relational/entities/group-role.entity';

@Injectable()
export class GroupSeedService {
  private groupRepository: Repository<GroupEntity>;
  private userRepository: Repository<UserEntity>;
  private categoryRepository: Repository<CategoryEntity>;
  private groupMemberRepository: Repository<GroupMemberEntity>;
  private groupRoleRepository: Repository<GroupRoleEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.groupRepository = dataSource.getRepository(GroupEntity);
    this.userRepository = dataSource.getRepository(UserEntity);
    this.categoryRepository = dataSource.getRepository(CategoryEntity);
    this.groupRoleRepository = dataSource.getRepository(GroupRoleEntity);
    this.groupMemberRepository = dataSource.getRepository(GroupMemberEntity);

    const count = await this.groupRepository.count();
    if (!count) {
      await this.seedGroups();
    }
  }

  private async seedGroups() {
    const allCategories = await this.categoryRepository.find();
    const allUsers = await this.userRepository.find();

    for (const user of allUsers) {
      for (const groupData of groupSeedData) {
        const numberOfCategories = Math.floor(Math.random() * 3) + 1;

        const group = this.groupRepository.create({
          name: groupData.name,
          description: groupData.description,
          slug: slugify(groupData.name, {
            strict: true,
            lower: true,
          }),
          status: groupData.status,
          visibility: groupData.visibility,
          location: groupData.location,
          lat: groupData.lat,
          lon: groupData.lon,
          requireApproval: groupData.requireApproval,
          categories: this.getRandomCategories(
            allCategories,
            numberOfCategories,
          ).map((category) => category),
          createdBy: { id: user.id },
        });
        const savedGroup = await this.groupRepository.save(group);

        // by default member role
        const groupRole = await this.groupRoleRepository.findOne({
          where: { name: GroupRole.Owner },
        });

        const mappedDto = {
          user: { id: user.id },
          group: { id: savedGroup.id },
          groupRole: { id: groupRole?.id },
        };
        const groupMember = this.groupMemberRepository.create(mappedDto);
        await this.groupMemberRepository.save(groupMember);
      }
    }
  }

  private getRandomCategories(
    allCategories: CategoryEntity[],
    numberOfCategories: number,
  ) {
    return allCategories
      .sort(() => Math.random() - 0.5)
      .slice(0, numberOfCategories);
  }
}
