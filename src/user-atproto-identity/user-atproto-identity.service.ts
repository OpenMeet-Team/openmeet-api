import { Injectable, Inject, Scope } from '@nestjs/common';
import { Brackets, Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import {
  TakeOwnershipStatus,
  UserAtprotoIdentityEntity,
} from './infrastructure/persistence/relational/entities/user-atproto-identity.entity';
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
   * Find AT Protocol identities for multiple user ULIDs.
   * Returns a map of userUlid -> identity for efficient batch lookups.
   *
   * @param tenantId - The tenant ID
   * @param userUlids - Array of user ULIDs
   * @returns Map of userUlid to identity
   */
  async findByUserUlids(
    tenantId: string,
    userUlids: string[],
  ): Promise<Map<string, UserAtprotoIdentityEntity>> {
    if (userUlids.length === 0) return new Map();
    await this.getTenantRepository(tenantId);

    const identities = await this.repository
      .createQueryBuilder('identity')
      .where('identity.userUlid IN (:...userUlids)', { userUlids })
      .getMany();

    return new Map(identities.map((i) => [i.userUlid, i]));
  }

  /**
   * Delete an AT Protocol identity by user ULID.
   *
   * @param tenantId - The tenant ID
   * @param userUlid - The user's ULID
   */
  async deleteByUserUlid(tenantId: string, userUlid: string): Promise<void> {
    await this.getTenantRepository(tenantId);
    await this.repository.delete({ userUlid });
  }

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
      // Only null is accepted here: flips clear the marker together with
      // the credentials, but setting a state must go through the
      // compare-and-set transitionTakeOwnershipStatus, never a blind write
      takeOwnershipStatus: null;
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

  /**
   * Compare-and-set transition of the take-ownership marker.
   *
   * The marker must only ever move toward stronger evidence, and several
   * writers race on it: the reset request, the sweep in session creation,
   * and the custody flip. An unconditional write lets a stale reader
   * overwrite a stronger state — e.g. a session attempt that read 'pending'
   * clearing the marker after the reset was confirmed. This transition only
   * applies while the row still holds one of the expected states and is
   * still custodial, so stale writers lose instead.
   *
   * @returns true when the transition was applied
   */
  async transitionTakeOwnershipStatus(
    tenantId: string,
    id: number,
    expected: (TakeOwnershipStatus | null)[],
    to: TakeOwnershipStatus | null,
  ): Promise<boolean> {
    await this.getTenantRepository(tenantId);

    const expectedStatuses = expected.filter(
      (status): status is TakeOwnershipStatus => status !== null,
    );
    const expectNull = expected.includes(null);

    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ takeOwnershipStatus: to })
      .where('id = :id', { id })
      .andWhere('"isCustodial" = true')
      .andWhere(
        new Brackets((qb) => {
          if (expectedStatuses.length > 0) {
            qb.where('"takeOwnershipStatus" IN (:...expectedStatuses)', {
              expectedStatuses,
            });
            if (expectNull) {
              qb.orWhere('"takeOwnershipStatus" IS NULL');
            }
          } else {
            qb.where('"takeOwnershipStatus" IS NULL');
          }
        }),
      )
      .execute();

    return (result.affected ?? 0) > 0;
  }
}
