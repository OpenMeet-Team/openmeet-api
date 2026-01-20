import { Global, Module } from '@nestjs/common';
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
 * This module is global, so services are available throughout the application.
 */
@Global()
@Module({
  imports: [HttpModule],
  providers: [PdsCredentialService, PdsAccountService],
  exports: [PdsCredentialService, PdsAccountService],
})
export class PdsModule {}
