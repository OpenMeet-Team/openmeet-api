import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PdsCredentialService } from './pds-credential.service';
import { PdsAccountService } from './pds-account.service';
import { PdsSessionService } from './pds-session.service';
import { UserAtprotoIdentityModule } from '../user-atproto-identity/user-atproto-identity.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';
import { TenantModule } from '../tenant/tenant.module';

/**
 * PDS (Personal Data Server) module.
 *
 * Provides services for:
 * - Account provisioning (createAccount, createSession)
 * - Credential encryption/decryption (AES-256-GCM)
 * - Handle availability checks
 * - Unified session management (PdsSessionService)
 *
 * NOTE: This module is NOT global. Modules that need PDS services must
 * explicitly import PdsModule. This is intentional for security-sensitive
 * services that handle encryption keys.
 */
@Module({
  imports: [
    HttpModule,
    UserAtprotoIdentityModule,
    forwardRef(() => BlueskyModule),
    ElastiCacheModule,
    TenantModule,
  ],
  providers: [PdsCredentialService, PdsAccountService, PdsSessionService],
  exports: [PdsCredentialService, PdsAccountService, PdsSessionService],
})
export class PdsModule {}
