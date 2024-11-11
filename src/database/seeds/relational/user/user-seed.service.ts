import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { RoleEnum } from '../../../../role/role.enum';
import { StatusEnum } from '../../../../status/status.enum';
import { UserEntity } from '../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { RoleEntity } from 'src/role/infrastructure/persistence/relational/entities/role.entity';

@Injectable()
export class UserSeedService {
  private repository: Repository<UserEntity>;
  private roleRepository: Repository<RoleEntity>;
  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.repository = dataSource.getRepository(UserEntity);
    this.roleRepository = dataSource.getRepository(RoleEntity);

    for (const roleName of [RoleEnum.User, RoleEnum.Admin]) {
      const count = await this.repository.count({
        where: {
          role: {
            name: roleName,
          },
        },
      });

      if (!count) {
        const role = await this.roleRepository.findOne({
          where: {
            name: roleName,
          },
        });

        const salt = await bcrypt.genSalt();
        const password = await bcrypt.hash('secret', salt);

        await this.repository.save(
          this.repository.create({
            firstName: roleName,
            lastName: roleName,
            email: `${tenantId}.${roleName.toLowerCase()}@openmeet.net`, // ex. 1.user@openmeet.net, 1.admin@openmeet.net
            password,
            role: {
              id: role?.id,
            },
            status: {
              id: StatusEnum.active,
              name: 'Active',
            },
          }),
        );
      }
    }
  }
}
