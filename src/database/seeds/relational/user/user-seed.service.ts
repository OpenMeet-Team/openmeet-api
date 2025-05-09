import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { RoleEnum } from '../../../../role/role.enum';
import { UserEntity } from '../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { RoleEntity } from 'src/role/infrastructure/persistence/relational/entities/role.entity';
import { ConfigService } from '@nestjs/config';
import { StatusEntity } from '../../../../status/infrastructure/persistence/relational/entities/status.entity';

@Injectable()
export class UserSeedService {
  private repository: Repository<UserEntity>;
  private roleRepository: Repository<RoleEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly configService: ConfigService,
  ) {}

  private async createUserIfNotExists(
    credentials: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    },
    roleName: RoleEnum,
  ) {
    if (!credentials.email || !credentials.password) {
      return;
    }

    const role = await this.roleRepository.findOne({
      where: { name: roleName },
    });

    const existingUser = await this.repository.count({
      where: { role: { name: roleName } },
      relations: ['role.permissions'],
    });

    if (!existingUser && role) {
      const salt = await bcrypt.genSalt();
      const hashedPassword = await bcrypt.hash(credentials.password, salt);

      await this.repository.save(
        this.repository.create({
          firstName: credentials.firstName,
          lastName: credentials.lastName,
          email: credentials.email,
          password: hashedPassword,
          role: role,
          status: new StatusEntity(),
        } as UserEntity),
      );
    } else {
      console.log(
        `User ${credentials.email} already exists or role ${roleName} does not exist`,
      );
    }
  }

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.repository = dataSource.getRepository(UserEntity);
    this.roleRepository = dataSource.getRepository(RoleEntity);

    const adminCredentials = {
      email: this.configService.get('ADMIN_EMAIL', { infer: true }) as string,
      password: this.configService.get('ADMIN_PASSWORD', {
        infer: true,
      }) as string,
      firstName: 'The',
      lastName: 'Admin',
    };

    const testUserCredentials = {
      email: this.configService.get('TEST_USER_EMAIL', {
        infer: true,
      }) as string,
      password: this.configService.get('TEST_USER_PASSWORD', {
        infer: true,
      }) as string,
      firstName: 'Test',
      lastName: 'User',
    };

    await this.createUserIfNotExists(adminCredentials, RoleEnum.Admin);
    await this.createUserIfNotExists(testUserCredentials, RoleEnum.User);
  }
}
