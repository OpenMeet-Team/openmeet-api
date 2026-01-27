import {
  Injectable,
  ConflictException,
  Logger,
  Inject,
  Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import { PdsAccountService } from '../pds/pds-account.service';
import { PdsCredentialService } from '../pds/pds-credential.service';
import { PdsApiError } from '../pds/pds.errors';
import { AllConfigType } from '../config/config.type';

interface CreateIdentityUser {
  ulid: string;
  slug: string;
  email?: string | null;
}

/**
 * Service for AT Protocol identity management.
 *
 * Handles creation of custodial PDS accounts for users who don't have
 * an existing AT Protocol identity.
 */
@Injectable({ scope: Scope.REQUEST, durable: true })
export class AtprotoIdentityService {
  private readonly logger = new Logger(AtprotoIdentityService.name);

  constructor(
    private readonly userAtprotoIdentityService: UserAtprotoIdentityService,
    private readonly pdsAccountService: PdsAccountService,
    private readonly pdsCredentialService: PdsCredentialService,
    private readonly configService: ConfigService<AllConfigType>,
    @Inject(REQUEST) private readonly request?: any,
  ) {}

  /**
   * Ensure a user has an AT Protocol identity, creating one if needed.
   *
   * This is a "lazy creation" method suitable for use when publishing:
   * - Returns existing identity if user already has one
   * - Creates custodial identity if user has none
   * - Returns null on any failure (does not throw)
   *
   * @param tenantId - The tenant ID
   * @param user - User data (ulid, slug, email)
   * @returns The identity entity, or null if creation failed
   */
  async ensureIdentityForUser(
    tenantId: string,
    user: CreateIdentityUser,
  ): Promise<UserAtprotoIdentityEntity | null> {
    try {
      // Check if user already has an identity
      const existingIdentity =
        await this.userAtprotoIdentityService.findByUserUlid(
          tenantId,
          user.ulid,
        );

      if (existingIdentity) {
        return existingIdentity;
      }

      // Validate slug before attempting to create
      if (!user.slug || user.slug.trim().length === 0) {
        this.logger.warn(
          `Cannot create AT Protocol identity for user ${user.ulid}: no slug`,
        );
        return null;
      }

      // Check if PDS is configured
      const pdsUrl = this.configService.get('pds.url', { infer: true });
      if (!pdsUrl) {
        this.logger.warn(
          `Cannot create AT Protocol identity for user ${user.ulid}: PDS_URL not configured`,
        );
        return null;
      }

      // Attempt to create identity
      return await this.createIdentityInternal(tenantId, user, pdsUrl);
    } catch (error) {
      this.logger.warn(
        `Failed to ensure AT Protocol identity for user ${user.ulid}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Create an AT Protocol identity for a user.
   *
   * Creates a custodial PDS account on OpenMeet's PDS.
   * Throws ConflictException if user already has an identity.
   *
   * @param tenantId - The tenant ID
   * @param user - User data (ulid, slug, email)
   * @returns The created identity entity
   * @throws ConflictException if identity already exists
   */
  async createIdentity(
    tenantId: string,
    user: CreateIdentityUser,
  ): Promise<UserAtprotoIdentityEntity> {
    // Check if user already has an identity
    const existingIdentity =
      await this.userAtprotoIdentityService.findByUserUlid(tenantId, user.ulid);

    if (existingIdentity) {
      throw new ConflictException('AT Protocol identity already exists');
    }

    // Get PDS URL from config
    const pdsUrl = this.configService.get('pds.url', { infer: true });

    if (!pdsUrl) {
      throw new Error('PDS_URL is not configured');
    }

    return this.createIdentityInternal(tenantId, user, pdsUrl);
  }

  /**
   * Internal method to create a custodial PDS account.
   *
   * Shared by createIdentity (throws on failure) and ensureIdentityForUser
   * (catches errors and returns null).
   */
  private async createIdentityInternal(
    tenantId: string,
    user: CreateIdentityUser,
    pdsUrl: string,
  ): Promise<UserAtprotoIdentityEntity> {
    const email = user.email || `${user.ulid}@openmeet.net`;
    const maxCreateAttempts = 5;

    for (
      let createAttempt = 0;
      createAttempt < maxCreateAttempts;
      createAttempt++
    ) {
      // Generate unique handle
      const handle = await this.generateUniqueHandle(user.slug);

      // Generate secure random password
      const password = crypto.randomBytes(32).toString('hex');

      try {
        // Create account on PDS
        const pdsResponse = await this.pdsAccountService.createAccount({
          email,
          handle,
          password,
        });

        // Encrypt password for storage
        const encryptedPassword = this.pdsCredentialService.encrypt(password);

        // Store the AT Protocol identity
        const identity = await this.userAtprotoIdentityService.create(
          tenantId,
          {
            userUlid: user.ulid,
            did: pdsResponse.did,
            handle: pdsResponse.handle,
            pdsUrl,
            pdsCredentials: encryptedPassword,
            isCustodial: true,
          },
        );

        this.logger.log(
          `Created AT Protocol identity for user ${user.ulid}: ${pdsResponse.did} (handle: ${pdsResponse.handle})`,
        );

        return identity;
      } catch (error) {
        // Check if this is a "handle taken" error (race condition)
        const isHandleTaken =
          error instanceof PdsApiError &&
          (error.atError === 'HandleNotAvailable' ||
            error.atError === 'HandleAlreadyExists' ||
            (error.message?.toLowerCase().includes('handle') &&
              (error.message?.toLowerCase().includes('taken') ||
                error.message?.toLowerCase().includes('available'))));

        if (isHandleTaken && createAttempt < maxCreateAttempts - 1) {
          this.logger.warn(
            `Handle ${handle} was taken between check and create (attempt ${createAttempt + 1}/${maxCreateAttempts}), retrying...`,
          );
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      `Failed to create PDS account after ${maxCreateAttempts} attempts`,
    );
  }

  /**
   * Generate a unique AT Protocol handle for a user.
   *
   * Tries the base slug first, then appends incrementing numbers if taken.
   */
  private async generateUniqueHandle(baseSlug: string): Promise<string> {
    if (!baseSlug || typeof baseSlug !== 'string') {
      throw new Error('Cannot generate handle: slug is required');
    }

    const trimmedSlug = baseSlug.trim();
    if (trimmedSlug.length === 0) {
      throw new Error('Cannot generate handle: slug cannot be empty');
    }

    const handleDomain =
      this.configService.get('pds.serviceHandleDomains', { infer: true }) ||
      '.opnmt.me';

    // PDS limits first segment to 18 characters
    const maxFirstSegment = 18;
    const collisionSuffixReserve = 2;
    const maxSlugLength = maxFirstSegment - collisionSuffixReserve;

    let truncatedSlug =
      trimmedSlug.length > maxSlugLength
        ? trimmedSlug.slice(0, maxSlugLength)
        : trimmedSlug;
    truncatedSlug = truncatedSlug.replace(/-+$/, '');

    if (truncatedSlug.length === 0) {
      throw new Error(
        'Cannot generate handle: slug results in empty string after processing',
      );
    }

    let handle = `${truncatedSlug}${handleDomain}`;
    let attempt = 0;
    const maxAttempts = 99;

    while (attempt < maxAttempts) {
      try {
        const isAvailable =
          await this.pdsAccountService.isHandleAvailable(handle);
        if (isAvailable) {
          return handle;
        }
      } catch (error) {
        throw error;
      }

      attempt++;
      handle = `${truncatedSlug}${attempt}${handleDomain}`;
    }

    throw new Error(
      `Could not find available handle after ${maxAttempts} attempts`,
    );
  }
}
