import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';
import { RoleEnum } from '../../../../role/role.enum';
import { UserEntity } from '../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { RoleEntity } from 'src/role/infrastructure/persistence/relational/entities/role.entity';
import { ConfigService } from '@nestjs/config';
import { StatusEntity } from '../../../../status/infrastructure/persistence/relational/entities/status.entity';
import { fetchTenants } from '../../../../utils/tenant-config';
import { TenantConfig } from '../../../../core/constants/constant';

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

    // Create bot user if configured for this tenant
    await this.createBotUserIfConfigured(tenantId);
  }

  private async createBotUserIfConfigured(tenantId: string) {
    const tenants: TenantConfig[] = fetchTenants();
    const tenant = tenants.find((t) => t.id === tenantId);

    if (!tenant?.matrixConfig?.botUser) {
      console.log(`No bot user configured for tenant: ${tenantId}`);
      return;
    }

    console.log(`🤖 Creating bot user for tenant: ${tenantId}`);

    const existingBot = await this.repository.findOne({
      where: { email: tenant.matrixConfig.botUser.email },
    });

    if (existingBot) {
      console.log(
        `  ✓ Bot user already exists: ${tenant.matrixConfig.botUser.slug}`,
      );
      return;
    }

    const userRole = await this.roleRepository.findOne({
      where: { name: RoleEnum.User },
    });

    if (!userRole) {
      console.log(
        `  ⚠️ User role not found for tenant ${tenantId}, skipping bot creation`,
      );
      return;
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(
      tenant.matrixConfig.botUser.password,
      salt,
    );

    await this.repository.save(
      this.repository.create({
        firstName: 'OpenMeet',
        lastName: 'Bot',
        email: tenant.matrixConfig.botUser.email,
        slug: tenant.matrixConfig.botUser.slug,
        password: hashedPassword,
        role: userRole,
        status: new StatusEntity(),
      } as UserEntity),
    );

    console.log(`  ✅ Created bot user: ${tenant.matrixConfig.botUser.slug}`);
  }
}
