import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { groupSeedData } from './group-seed.seed';
import { GroupEntity } from 'src/group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { CategoryEntity } from 'src/category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupService } from 'src/group/group.service';
import { TenantConnectionService } from 'src/tenant/tenant.service';

@Injectable()
export class GroupSeedService {
  private groupRepository: Repository<GroupEntity>;
  private userRepository: Repository<UserEntity>;
  private categoryRepository: Repository<CategoryEntity>;

  constructor(
    private groupService: GroupService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    console.log('🚀 ~ GroupSeedService ~ run ~ tenantId:', tenantId);
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.groupRepository = dataSource.getRepository(GroupEntity);
    this.userRepository = dataSource.getRepository(UserEntity);
    this.categoryRepository = dataSource.getRepository(CategoryEntity);

    await this.seedGroups();
  }

  private async seedGroups() {
    const allCategories = await this.categoryRepository.find();
    const allUsers = await this.userRepository.find();

    for (const user of allUsers) {
      for (const groupData of groupSeedData) {
        const numberOfCategories = Math.floor(Math.random() * 3) + 1;

        const group = await this.groupService.create(
          {
            name: groupData.name,
            description: groupData.description,
            status: groupData.status,
            visibility: groupData.visibility,
            location: groupData.location,
            lat: groupData.lat,
            lon: groupData.lon,
            categories: this.getRandomCategories(
              allCategories,
              numberOfCategories,
            ).map((category) => category.id),
          },
          user.id,
        );

        console.log(group);
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
