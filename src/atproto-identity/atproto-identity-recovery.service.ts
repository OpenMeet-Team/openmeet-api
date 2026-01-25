import {
  Injectable,
  Logger,
  Inject,
  Scope,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import { PdsAccountService } from '../pds/pds-account.service';
import { PdsCredentialService } from '../pds/pds-credential.service';
import { UserService } from '../user/user.service';
import { AllConfigType } from '../config/config.type';

export interface RecoveryStatus {
  hasExistingAccount: boolean;
  did?: string;
  handle?: string;
}

/**
 * Service for recovering AT Protocol identities for users who have an existing
 * PDS account but no linked identity in OpenMeet.
 *
 * This handles cases where:
 * 1. A user created a PDS account but the identity link wasn't saved
 * 2. Database migration issues caused identity records to be lost
 * 3. Manual recovery is needed after system issues
 */
@Injectable({ scope: Scope.REQUEST, durable: true })
export class AtprotoIdentityRecoveryService {
  private readonly logger = new Logger(AtprotoIdentityRecoveryService.name);

  constructor(
    private readonly userAtprotoIdentityService: UserAtprotoIdentityService,
    private readonly pdsAccountService: PdsAccountService,
    private readonly pdsCredentialService: PdsCredentialService,
    private readonly userService: UserService,
    private readonly configService: ConfigService<AllConfigType>,
    @Inject(REQUEST) private readonly request?: any,
  ) {}

  /**
   * Check if user's email has an existing PDS account that can be recovered.
   *
   * @param tenantId - The tenant ID
   * @param userUlid - The user's ULID
   * @returns Recovery status including whether an account exists and its DID/handle
   */
  async checkRecoveryStatus(
    tenantId: string,
    userUlid: string,
  ): Promise<RecoveryStatus> {
    // Get user to check email
    const user = await this.userService.findByUlid(userUlid, tenantId);
    if (!user || !user.email) {
      return { hasExistingAccount: false };
    }

    // Check if already has identity
    const existingIdentity =
      await this.userAtprotoIdentityService.findByUserUlid(tenantId, userUlid);
    if (existingIdentity) {
      return { hasExistingAccount: false }; // Already linked
    }

    // Search for account on PDS
    const pdsAccount = await this.pdsAccountService.searchAccountsByEmail(
      user.email,
    );
    if (!pdsAccount) {
      return { hasExistingAccount: false };
    }

    return {
      hasExistingAccount: true,
      did: pdsAccount.did,
      handle: pdsAccount.handle,
    };
  }

  /**
   * Recover existing PDS account as custodial (admin password reset).
   * Sets a new random password and links the account.
   *
   * @param tenantId - The tenant ID
   * @param userUlid - The user's ULID
   * @returns The created identity entity
   * @throws NotFoundException if user or PDS account not found
   * @throws BadRequestException if user already has identity
   */
  async recoverAsCustodial(
    tenantId: string,
    userUlid: string,
  ): Promise<UserAtprotoIdentityEntity> {
    const user = await this.userService.findByUlid(userUlid, tenantId);
    if (!user || !user.email) {
      throw new NotFoundException('User not found or has no email');
    }

    // Check if already has identity
    const existingIdentity =
      await this.userAtprotoIdentityService.findByUserUlid(tenantId, userUlid);
    if (existingIdentity) {
      throw new BadRequestException('User already has AT Protocol identity');
    }

    // Find account on PDS
    const pdsAccount = await this.pdsAccountService.searchAccountsByEmail(
      user.email,
    );
    if (!pdsAccount) {
      throw new NotFoundException('No PDS account found for this email');
    }

    // Generate new random password
    const password = crypto.randomBytes(32).toString('hex');

    // Reset password via admin API
    await this.pdsAccountService.adminUpdateAccountPassword(
      pdsAccount.did,
      password,
    );

    // Encrypt password for storage
    const encryptedPassword = this.pdsCredentialService.encrypt(password);

    // Get PDS URL from config
    const pdsUrl = this.configService.get('pds.url', { infer: true });

    // Create identity record
    const identity = await this.userAtprotoIdentityService.create(tenantId, {
      userUlid,
      did: pdsAccount.did,
      handle: pdsAccount.handle,
      pdsUrl: pdsUrl || '',
      pdsCredentials: encryptedPassword,
      isCustodial: true,
    });

    this.logger.log(
      `Recovered PDS account as custodial for user ${userUlid}: ${pdsAccount.did}`,
    );

    return identity;
  }

  /**
   * Initiate take ownership: trigger PDS password reset email.
   * User will receive email to set their own password.
   *
   * @param tenantId - The tenant ID
   * @param userUlid - The user's ULID
   * @returns Object with the email address the reset was sent to
   * @throws NotFoundException if user not found
   * @throws BadRequestException if no custodial identity exists
   */
  async initiateTakeOwnership(
    tenantId: string,
    userUlid: string,
  ): Promise<{ email: string }> {
    const user = await this.userService.findByUlid(userUlid, tenantId);
    if (!user || !user.email) {
      throw new NotFoundException('User not found or has no email');
    }

    // Check if user has custodial identity
    const identity = await this.userAtprotoIdentityService.findByUserUlid(
      tenantId,
      userUlid,
    );
    if (!identity) {
      throw new BadRequestException(
        'User has no AT Protocol identity to take ownership of',
      );
    }
    if (!identity.isCustodial) {
      throw new BadRequestException(
        'User already owns their AT Protocol identity',
      );
    }

    // Trigger PDS password reset email
    await this.pdsAccountService.requestPasswordReset(user.email);

    this.logger.log(
      `Initiated take ownership for user ${userUlid}: password reset email sent to ${user.email}`,
    );

    return { email: user.email };
  }

  /**
   * Complete take ownership: user confirms they've set password, we clear credentials.
   *
   * @param tenantId - The tenant ID
   * @param userUlid - The user's ULID
   * @throws BadRequestException if no custodial identity exists
   */
  async completeTakeOwnership(
    tenantId: string,
    userUlid: string,
  ): Promise<void> {
    const identity = await this.userAtprotoIdentityService.findByUserUlid(
      tenantId,
      userUlid,
    );
    if (!identity) {
      throw new BadRequestException('User has no AT Protocol identity');
    }
    if (!identity.isCustodial) {
      throw new BadRequestException(
        'User already owns their AT Protocol identity',
      );
    }

    // Clear credentials and mark as non-custodial
    await this.userAtprotoIdentityService.update(tenantId, identity.id, {
      pdsCredentials: null,
      isCustodial: false,
    });

    this.logger.log(
      `Completed take ownership for user ${userUlid}: cleared credentials, now non-custodial`,
    );
  }
}
