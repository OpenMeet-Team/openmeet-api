import { Inject, Injectable, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../tenant/tenant.service';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { EventRoleEntity } from './infrastructure/persistence/relational/entities/event-role.entity';
import { EventAttendeeRole } from '../core/constants/constant';
import { CreateEventRoleDto } from './dto/create-eventRole.dto';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventRoleService {
  private eventRoleRepository: Repository<EventRoleEntity>;
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRoleRepository = dataSource.getRepository(EventRoleEntity);
  }

  async create(createDto: CreateEventRoleDto) {
    await this.getTenantSpecificEventRepository();
    const eventRole = this.eventRoleRepository.create(createDto);
    return await this.eventRoleRepository.save(eventRole);
  }

  async findByName(name: EventAttendeeRole) {
    await this.getTenantSpecificEventRepository();
    return await this.eventRoleRepository.findOne({
      where: { name },
    });
  }

  async findOne(name: string): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return await this.eventRoleRepository.findOne({
      where: { name: name as EventAttendeeRole },
      relations: ['permissions'],
    });
  }
}
