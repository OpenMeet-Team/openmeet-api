import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { GroupRoleEntity } from './infrastructure/persistence/relational/entities/group-role.entity';
import { CreateGroupRoleDto } from './dto/create-groupRole.dto';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupRoleService {
  private groupRoleRepository: Repository<GroupRoleEntity>;
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.groupRoleRepository = dataSource.getRepository(GroupRoleEntity);
  }

  async create(createDto: CreateGroupRoleDto) {
    await this.getTenantSpecificEventRepository();
    const groupRole = this.groupRoleRepository.create(createDto);
    return await this.groupRoleRepository.save(groupRole);
  }

  async findOne(name: string): Promise<any> {
    await this.getTenantSpecificEventRepository()
    return await this.groupRoleRepository.findOne({
      where: { name },
      relations: ['groupPermissions'],
    });
  }
}
