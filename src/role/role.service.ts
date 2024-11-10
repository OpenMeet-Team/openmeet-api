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

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.roleRepository = dataSource.getRepository(RoleEntity);
  }

  async findByName(name: RoleEnum) {
    await this.getTenantSpecificEventRepository();
    const role = await this.roleRepository.findOne({ where: { name } });
    return role;
  }
}
