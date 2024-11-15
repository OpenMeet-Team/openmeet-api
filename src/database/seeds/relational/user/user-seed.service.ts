import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { RoleEnum } from '../../../../role/role.enum';
import { StatusEnum } from '../../../../status/status.enum';
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
    }
  }

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.repository = dataSource.getRepository(UserEntity);
    this.roleRepository = dataSource.getRepository(RoleEntity);

    /* eslint-disable no-restricted-syntax */
    const adminCredentials = {
      email: `${tenantId}.${this.configService.get('ADMIN_EMAIL') as string}`,
      password: this.configService.get('ADMIN_PASSWORD') as string,
      firstName: 'The',
      lastName: 'Admin',
    };

    const testUserCredentials = {
      email: `${tenantId}.${this.configService.get('TEST_USER_EMAIL') as string}`,
      password: this.configService.get('TEST_USER_PASSWORD') as string,
      firstName: 'Test',
      lastName: 'User',
    };
    /* eslint-enable no-restricted-syntax */

    await this.createUserIfNotExists(adminCredentials, RoleEnum.Admin);
    await this.createUserIfNotExists(testUserCredentials, RoleEnum.User);
  }
}
