import { Injectable, Inject, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { UserAtprotoIdentityEntity } from './infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import { NullableType } from '../utils/types/nullable.type';

/**
 * Service for managing user AT Protocol identities.
 *
 * Provides CRUD operations for linking OpenMeet users to their
 * AT Protocol DIDs and PDS accounts.
 */
@Injectable({ scope: Scope.REQUEST, durable: true })
export class UserAtprotoIdentityService {
  private repository: Repository<UserAtprotoIdentityEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Get tenant-specific repository for the entity.
   * Must be called before any database operations.
   */
  private async getTenantRepository(tenantId: string): Promise<void> {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.repository = dataSource.getRepository(UserAtprotoIdentityEntity);
  }

  /**
   * Find an AT Protocol identity by user ULID.
   *
   * @param tenantId - The tenant ID
   * @param userUlid - The user's ULID
   * @returns The identity if found, null otherwise
   */
  async findByUserUlid(
    tenantId: string,
    userUlid: string,
  ): Promise<NullableType<UserAtprotoIdentityEntity>> {
    await this.getTenantRepository(tenantId);

    return this.repository.findOne({
      where: { userUlid },
    });
  }

  /**
   * Find an AT Protocol identity by DID.
   *
   * @param tenantId - The tenant ID
   * @param did - The decentralized identifier
   * @returns The identity if found, null otherwise
   */
  async findByDid(
    tenantId: string,
    did: string,
  ): Promise<NullableType<UserAtprotoIdentityEntity>> {
    await this.getTenantRepository(tenantId);

    return this.repository.findOne({
      where: { did },
    });
  }

  /**
   * Create a new AT Protocol identity for a user.
   *
   * @param tenantId - The tenant ID
   * @param data - The identity data to create
   * @returns The created identity
   */
  /**
   * Create a new AT Protocol identity for a user.
   *
   * @param tenantId - The tenant ID
   * @param data - The identity data to create
   * @param data.pdsCredentials - Encrypted credentials from PdsCredentialService.encrypt()
   * @returns The created identity
   */
  async create(
    tenantId: string,
    data: {
      userUlid: string;
      did: string;
      handle?: string | null;
      pdsUrl: string;
      pdsCredentials?: string | null;
      isCustodial?: boolean;
    },
  ): Promise<UserAtprotoIdentityEntity> {
    await this.getTenantRepository(tenantId);

    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  /**
   * Update an existing AT Protocol identity.
   *
   * @param tenantId - The tenant ID
   * @param id - The identity ID
   * @param data - The data to update
   * @returns The updated identity if found, null otherwise
   */
  /**
   * Update an existing AT Protocol identity.
   *
   * @param tenantId - The tenant ID
   * @param id - The identity ID
   * @param data - The data to update
   * @param data.pdsCredentials - Encrypted credentials from PdsCredentialService.encrypt()
   * @returns The updated identity if found, null otherwise
   */
  async update(
    tenantId: string,
    id: number,
    data: Partial<{
      handle: string | null;
      pdsUrl: string;
      pdsCredentials: string | null;
      isCustodial: boolean;
    }>,
  ): Promise<NullableType<UserAtprotoIdentityEntity>> {
    await this.getTenantRepository(tenantId);

    const existing = await this.repository.findOne({ where: { id } });
    if (!existing) {
      return null;
    }

    Object.assign(existing, data);
    return this.repository.save(existing);
  }
}
