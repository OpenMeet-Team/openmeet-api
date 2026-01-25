// PDS Module exports
export { PdsModule } from './pds.module';

// Services
export { PdsCredentialService } from './pds-credential.service';
export {
  PdsAccountService,
  CreateAccountResponse,
  CreateSessionResponse,
} from './pds-account.service';

// Errors
export { PdsApiError, PdsCredentialDecryptionError } from './pds.errors';

// Error detection utilities
export {
  isServiceNotConfiguredError,
  SERVICE_NOT_CONFIGURED_PATTERNS,
} from './pds-error-detection';

// Config
export { PdsConfig } from './config/pds-config.type';
export { default as pdsConfig } from './config/pds.config';
