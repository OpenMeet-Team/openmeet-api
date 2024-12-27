import { Inject, Injectable, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { RoleEntity } from './infrastructure/persistence/relational/entities/role.entity';
import { RoleEnum } from './role.enum';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class RoleService {
  private roleRepository: Repository<RoleEntity>;
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async getTenantSpecificRepository(tenantId?: string) {
    // Use provided tenantId or fall back to request context
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      throw new Error(
        'Tenant ID is required (either from request or parameter)',
      );
    }

    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    this.roleRepository = dataSource.getRepository(RoleEntity);
  }

  async findByName(name: RoleEnum, tenantId?: string) {
    await this.getTenantSpecificRepository(tenantId);
    const role = await this.roleRepository.findOne({ where: { name } });
    return role;
  }
}
