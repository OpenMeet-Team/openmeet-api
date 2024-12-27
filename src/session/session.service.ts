import { Inject, Injectable, Scope } from '@nestjs/common';

import { Session } from './domain/session';
import { User } from '../user/domain/user';
import { NullableType } from '../utils/types/nullable.type';
import { Not, Repository } from 'typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { SessionEntity } from './infrastructure/persistence/relational/entities/session.entity';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class SessionService {
  private sessionRepository: Repository<SessionEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async getTenantSpecificRepository(tenantId?: string) {
    const effectiveTenantId = tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    this.sessionRepository = dataSource.getRepository(SessionEntity);
  }

  async findById(id: Session['id']): Promise<NullableType<Session>> {
    await this.getTenantSpecificRepository();

    return this.sessionRepository.findOne({
      where: { id: Number(id) },
    });
  }

  async create(
    data: Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
    tenantId?: string,
  ): Promise<Session> {
    await this.getTenantSpecificRepository(tenantId);

    // Create a new session entity from the provided data
    const newSessionEntity = this.sessionRepository.create(
      data as Partial<SessionEntity>,
    );
    // console.log(await this.sessionRepository.find(), newSessionEntity);
    // Save the new session to the database
    const savedSessionEntity =
      await this.sessionRepository.save(newSessionEntity);

    // Return the saved session, mapped back to the Session type (domain model)
    return {
      id: savedSessionEntity.id,
      user: savedSessionEntity.user,
      hash: savedSessionEntity.hash,
      createdAt: savedSessionEntity.createdAt,
      updatedAt: savedSessionEntity.updatedAt,
      deletedAt: savedSessionEntity.deletedAt,
    } as Session;
  }

  async update(
    id: Session['id'],
    payload: Partial<
      Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
  ): Promise<any | null> {
    await this.getTenantSpecificRepository();

    return await this.sessionRepository.update(id, payload as any);
  }

  async deleteById(id: Session['id']): Promise<void> {
    await this.getTenantSpecificRepository();
    await this.sessionRepository.softDelete({
      user: {
        id: Number(id),
      },
    });
  }

  async deleteByUserId(conditions: { userId: User['id'] }): Promise<void> {
    await this.getTenantSpecificRepository();

    await this.sessionRepository.softDelete({
      user: {
        id: Number(conditions.userId),
      },
    });
  }

  async deleteByUserIdWithExclude(conditions: {
    userId: User['id'];
    excludeSessionId: Session['id'];
  }): Promise<void> {
    await this.getTenantSpecificRepository();

    await this.sessionRepository.softDelete({
      user: {
        id: Number(conditions.userId),
      },
      id: Not(Number(conditions.excludeSessionId)),
    });
  }
}
