import { Injectable, Logger } from '@nestjs/common';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { AuthProvidersEnum } from '../../auth/auth-providers.enum';
import { ulid } from 'ulid';
import slugify from 'slugify';
import { generateShortCode } from '../../utils/short-code';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

/**
 * Service for managing shadow accounts created from Bluesky integration
 * Shadow accounts are lightweight provisional accounts created for Bluesky users
 * who haven't yet registered with OpenMeet but have created events on Bluesky.
 */
@Injectable()
export class ShadowAccountService {
  private readonly logger = new Logger(ShadowAccountService.name);
  private readonly tracer = trace.getTracer('shadow-account-service');

  constructor(private readonly tenantService: TenantConnectionService) {}

  /**
   * Find or create a shadow account for a Bluesky user
   * @param did Decentralized Identifier for the Bluesky user
   * @param handle Handle for the Bluesky user
   * @param targetTenantId ID of the tenant to place the shadow account in
   * @returns The user entity for the shadow account
   */
  async findOrCreateShadowAccount(
    did: string,
    handle: string,
    targetTenantId: string,
  ): Promise<UserEntity> {
    return this.tracer.startActiveSpan(
      'findOrCreateShadowAccount',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('did', did);
          span.setAttribute('handle', handle);
          span.setAttribute('tenantId', targetTenantId);

          // Get connection for the specified tenant
          const tenantConnection =
            await this.tenantService.getTenantConnection(targetTenantId);

          const userRepository = tenantConnection.getRepository(UserEntity);

          // Check if shadow account already exists
          let shadowUser = await userRepository.findOne({
            where: {
              socialId: did,
              provider: AuthProvidersEnum.bluesky,
              isShadowAccount: true,
            },
          });

          if (shadowUser) {
            span.setAttribute('accountFound', true);
            return shadowUser;
          }

          span.setAttribute('accountFound', false);
          span.setAttribute('creating', true);

          // Create a new shadow account
          shadowUser = new UserEntity();
          shadowUser.socialId = did;
          shadowUser.provider = AuthProvidersEnum.bluesky;
          shadowUser.isShadowAccount = true;
          shadowUser.email = null;
          shadowUser.firstName = handle;
          shadowUser.lastName = null;
          // Use empty string instead of null for password
          shadowUser.password = '';
          shadowUser.ulid = ulid().toLowerCase();
          shadowUser.slug = `${slugify(handle.trim().toLowerCase(), {
            strict: true,
            lower: true,
          })}-${generateShortCode().toLowerCase()}`;

          // Set Bluesky preferences
          shadowUser.preferences = {
            bluesky: {
              did: did,
              handle: handle,
              connected: false,
            },
          };

          // Save the shadow account
          const savedUser = await userRepository.save(shadowUser);

          this.logger.log(
            `Created shadow account for Bluesky user ${handle} (${did}) in tenant ${targetTenantId}`,
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
   * Claim a shadow account when a real user logs in with Bluesky
   * @param userId ID of the real user
   * @param did Decentralized Identifier for the Bluesky user
   * @param tenantId ID of the tenant
   * @returns The updated user entity or null if no shadow account exists
   */
  async claimShadowAccount(
    userId: number,
    did: string,
    tenantId: string,
  ): Promise<UserEntity | null> {
    return this.tracer.startActiveSpan(
      'claimShadowAccount',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('userId', userId);
          span.setAttribute('did', did);
          span.setAttribute('tenantId', tenantId);

          // Get tenant connection
          const tenantConnection =
            await this.tenantService.getTenantConnection(tenantId);

          const userRepository = tenantConnection.getRepository(UserEntity);

          // Find the shadow account
          const shadowUser = await userRepository.findOne({
            where: {
              socialId: did,
              provider: AuthProvidersEnum.bluesky,
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
              `Claimed shadow account for ${did} by user ${userId} in tenant ${tenantId}`,
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
   * Find all shadow accounts in a tenant
   * @param tenantId ID of the tenant
   * @returns Array of shadow user entities
   */
  async findAllShadowAccounts(tenantId: string): Promise<UserEntity[]> {
    return this.tracer.startActiveSpan(
      'findAllShadowAccounts',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('tenantId', tenantId);

          // Get tenant connection
          const tenantConnection =
            await this.tenantService.getTenantConnection(tenantId);

          const userRepository = tenantConnection.getRepository(UserEntity);

          // Find all shadow accounts
          const shadowUsers = await userRepository.find({
            where: {
              isShadowAccount: true,
              provider: AuthProvidersEnum.bluesky,
            },
          });

          span.setAttribute('shadowAccountsCount', shadowUsers.length);

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
}
