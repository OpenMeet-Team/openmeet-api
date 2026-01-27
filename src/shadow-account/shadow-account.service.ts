import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { StatusEntity } from '../status/infrastructure/persistence/relational/entities/status.entity';
import { TenantConnectionService } from '../tenant/tenant.service';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { StatusEnum } from '../status/status.enum';
import { ulid } from 'ulid';
import slugify from 'slugify';
import { generateShortCode } from '../utils/short-code';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';

/**
 * Service for managing shadow accounts across different platforms
 * Shadow accounts are lightweight provisional accounts created for external users
 * who haven't yet registered with OpenMeet but have created content that is imported.
 */
@Injectable()
export class ShadowAccountService {
  private readonly logger = new Logger(ShadowAccountService.name);
  private readonly tracer = trace.getTracer('shadow-account-service');

  constructor(
    private readonly tenantService: TenantConnectionService,
    @Inject(forwardRef(() => BlueskyIdentityService))
    private readonly blueskyIdentityService: BlueskyIdentityService,
  ) {}

  /**
   * Find or create a shadow account for an external user
   * @param externalId External identifier for the user (e.g., DID for Bluesky)
   * @param displayName Display name for the user (e.g., handle for Bluesky)
   * @param provider Authentication provider (e.g., bluesky, matrix)
   * @param targetTenantId ID of the tenant to place the shadow account in
   * @param preferences Additional provider-specific preferences
   * @returns The user entity for the shadow account
   */
  async findOrCreateShadowAccount(
    externalId: string,
    displayName: string,
    provider: AuthProvidersEnum,
    targetTenantId: string,
    preferences?: Record<string, any>,
  ): Promise<UserEntity> {
    return this.tracer.startActiveSpan(
      'findOrCreateShadowAccount',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('externalId', externalId);
          span.setAttribute('displayName', displayName);
          span.setAttribute('provider', provider);
          span.setAttribute('tenantId', targetTenantId);

          // Get connection for the specified tenant
          const tenantConnection =
            await this.tenantService.getTenantConnection(targetTenantId);

          const userRepository = tenantConnection.getRepository(UserEntity);

          // First check if ANY user (real or shadow) already exists with this external ID
          // This prevents creating duplicate shadow accounts when a real user exists
          const existingUser = await userRepository.findOne({
            where: {
              socialId: externalId,
              provider: provider,
            },
          });

          if (existingUser) {
            span.setAttribute('accountFound', true);
            span.setAttribute('isRealUser', !existingUser.isShadowAccount);

            // If it's a real user, return them directly (don't create shadow account)
            if (!existingUser.isShadowAccount) {
              this.logger.log(
                `Found existing real user for ${provider} with external ID ${externalId} in tenant ${targetTenantId}, skipping shadow account creation`,
              );
              return existingUser;
            }

            // If it's already a shadow account, return it
            this.logger.log(
              `Found existing shadow account for ${provider} with external ID ${externalId} in tenant ${targetTenantId}`,
            );
            return existingUser;
          }

          span.setAttribute('accountFound', false);
          span.setAttribute('creating', true);

          // Create a new shadow account
          const shadowUser = new UserEntity();
          shadowUser.socialId = externalId;
          shadowUser.provider = provider;
          shadowUser.isShadowAccount = true;
          shadowUser.email = null;

          // ✅ RESOLVE HANDLE FOR BLUESKY USERS
          let resolvedHandle = displayName; // Default to displayName

          if (provider === AuthProvidersEnum.bluesky) {
            try {
              // If displayName is already a handle (not a DID), use it
              if (!displayName.startsWith('did:')) {
                resolvedHandle = displayName;
                this.logger.log(
                  `Using provided handle for ${externalId}: ${displayName}`,
                );
              } else {
                // Resolve DID → handle
                resolvedHandle =
                  await this.blueskyIdentityService.extractHandleFromDid(
                    externalId,
                  );
                this.logger.log(`Resolved ${externalId} → ${resolvedHandle}`);
              }
            } catch (error) {
              this.logger.warn(
                `Could not resolve handle for ${externalId}: ${error.message}. Falling back to DID.`,
              );
              resolvedHandle = externalId; // Fallback to DID
            }
          }

          shadowUser.firstName = resolvedHandle; // ✅ Store handle, not DID
          shadowUser.lastName = null;
          // Use empty string instead of null for password
          shadowUser.password = '';

          // Set status to active
          const status = new StatusEntity();
          status.id = StatusEnum.active;
          shadowUser.status = status;

          shadowUser.ulid = ulid().toLowerCase();
          shadowUser.slug = slugify(
            (displayName || 'shadow-user').trim() +
              '-' +
              generateShortCode().toLowerCase(),
            { strict: true, lower: true },
          );

          // Set provider-specific preferences
          shadowUser.preferences = preferences || {};

          // Ensure preferences.bluesky.handle uses resolved handle
          if (
            provider === AuthProvidersEnum.bluesky &&
            shadowUser.preferences.bluesky
          ) {
            shadowUser.preferences.bluesky.handle = resolvedHandle;
          }

          // Save the shadow account
          const savedUser = await userRepository.save(shadowUser);

          this.logger.log(
            `Created shadow account for ${provider} user ${displayName} (${externalId}) in tenant ${targetTenantId}`,
          );

          return savedUser;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          this.logger.error(
            `Error creating shadow account: ${error.message}`,
            error.stack,
          );
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Find shadow account by external ID and provider
   * @param externalId External identifier (e.g., DID for Bluesky)
   * @param provider Authentication provider (e.g., bluesky, matrix)
   * @param tenantId ID of the tenant
   * @returns The shadow user entity or null if not found
   */
  async findShadowAccountByExternalId(
    externalId: string,
    provider: AuthProvidersEnum,
    tenantId: string,
  ): Promise<UserEntity | null> {
    return this.tracer.startActiveSpan(
      'findShadowAccountByExternalId',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('externalId', externalId);
          span.setAttribute('provider', provider);
          span.setAttribute('tenantId', tenantId);

          const tenantConnection =
            await this.tenantService.getTenantConnection(tenantId);

          const userRepository = tenantConnection.getRepository(UserEntity);

          const shadowUser = await userRepository.findOne({
            where: {
              socialId: externalId,
              provider: provider,
              isShadowAccount: true,
            },
          });

          return shadowUser || null;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          this.logger.error(
            `Error finding shadow account: ${error.message}`,
            error.stack,
          );
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Claim a shadow account when a real user logs in
   * @param userId ID of the real user
   * @param externalId External identifier (e.g., DID for Bluesky)
   * @param provider Authentication provider (e.g., bluesky, matrix)
   * @param tenantId ID of the tenant
   * @returns The updated user entity or null if no shadow account exists
   */
  async claimShadowAccount(
    userId: number,
    externalId: string,
    provider: AuthProvidersEnum,
    tenantId: string,
  ): Promise<UserEntity | null> {
    return this.tracer.startActiveSpan(
      'claimShadowAccount',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('userId', userId);
          span.setAttribute('externalId', externalId);
          span.setAttribute('provider', provider);
          span.setAttribute('tenantId', tenantId);

          // Get tenant connection
          const tenantConnection =
            await this.tenantService.getTenantConnection(tenantId);

          const userRepository = tenantConnection.getRepository(UserEntity);

          // Find the shadow account
          const shadowUser = await userRepository.findOne({
            where: {
              socialId: externalId,
              provider: provider,
              isShadowAccount: true,
            },
          });

          if (!shadowUser) {
            span.setAttribute('shadowAccountFound', false);
            return null;
          }

          span.setAttribute('shadowAccountFound', true);

          // Find the real user
          const realUser = await userRepository.findOne({
            where: {
              id: userId,
            },
          });

          if (!realUser) {
            throw new Error(`Real user with ID ${userId} not found`);
          }

          // Begin transaction to transfer ownership
          const queryRunner = tenantConnection.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();

          try {
            // Transfer event ownership
            await this.transferEventOwnership(
              shadowUser.id,
              realUser.id,
              queryRunner,
            );

            // Delete the shadow account
            await queryRunner.manager.remove(shadowUser);

            // Commit the transaction
            await queryRunner.commitTransaction();

            this.logger.log(
              `Claimed shadow account for ${provider} user ${externalId} by user ${userId} in tenant ${tenantId}`,
            );

            return realUser;
          } catch (error) {
            // Rollback the transaction on error
            await queryRunner.rollbackTransaction();
            throw error;
          } finally {
            // Release the query runner
            await queryRunner.release();
          }
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          this.logger.error(
            `Error claiming shadow account: ${error.message}`,
            error.stack,
          );
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Transfer ownership of events from shadow account to real account
   * @param shadowId ID of the shadow account
   * @param realUserId ID of the real user
   * @param queryRunner Active query runner for transaction
   */
  private async transferEventOwnership(
    shadowId: number,
    realUserId: number,
    queryRunner: any,
  ): Promise<void> {
    return this.tracer.startActiveSpan(
      'transferEventOwnership',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('shadowId', shadowId);
          span.setAttribute('realUserId', realUserId);

          // Update the user ID for all events owned by the shadow account
          await queryRunner.manager.query(
            `UPDATE events SET "userId" = $1 WHERE "userId" = $2`,
            [realUserId, shadowId],
          );

          // Update any other relations as needed
          // For example, event attendees, group memberships, etc.

          this.logger.log(
            `Transferred event ownership from shadow account ${shadowId} to user ${realUserId}`,
          );
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Find all shadow accounts for a tenant
   * @param tenantId ID of the tenant
   * @returns List of shadow account user entities
   */
  async findAllShadowAccounts(tenantId: string): Promise<UserEntity[]> {
    return this.tracer.startActiveSpan(
      'findAllShadowAccounts',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('tenantId', tenantId);

          const tenantConnection =
            await this.tenantService.getTenantConnection(tenantId);

          const userRepository = tenantConnection.getRepository(UserEntity);

          const shadowUsers = await userRepository.find({
            where: {
              isShadowAccount: true,
            },
            order: {
              createdAt: 'DESC',
            },
          });

          return shadowUsers;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          this.logger.error(
            `Error finding shadow accounts: ${error.message}`,
            error.stack,
          );
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Find all shadow accounts for a specific provider
   * @param provider Authentication provider (e.g., bluesky, matrix)
   * @param tenantId ID of the tenant
   * @returns List of shadow account user entities
   */
  async findShadowAccountsByProvider(
    provider: AuthProvidersEnum,
    tenantId: string,
  ): Promise<UserEntity[]> {
    return this.tracer.startActiveSpan(
      'findShadowAccountsByProvider',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('provider', provider);
          span.setAttribute('tenantId', tenantId);

          const tenantConnection =
            await this.tenantService.getTenantConnection(tenantId);

          const userRepository = tenantConnection.getRepository(UserEntity);

          const shadowUsers = await userRepository.find({
            where: {
              isShadowAccount: true,
              provider: provider,
            },
            order: {
              createdAt: 'DESC',
            },
          });

          return shadowUsers;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          this.logger.error(
            `Error finding shadow accounts by provider: ${error.message}`,
            error.stack,
          );
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }
}
