import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PdsCredentialService } from './pds-credential.service';
import { PdsAccountService } from './pds-account.service';

/**
 * PDS (Personal Data Server) module.
 *
 * Provides services for:
 * - Account provisioning (createAccount, createSession)
 * - Credential encryption/decryption (AES-256-GCM)
 * - Handle availability checks
 *
 * NOTE: This module is NOT global. Modules that need PDS services must
 * explicitly import PdsModule. This is intentional for security-sensitive
 * services that handle encryption keys.
 */
@Module({
  imports: [HttpModule],
  providers: [PdsCredentialService, PdsAccountService],
  exports: [PdsCredentialService, PdsAccountService],
})
export class PdsModule {}
