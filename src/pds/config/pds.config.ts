import { registerAs } from '@nestjs/config';
import { IsString, IsOptional, IsBase64 } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { PdsConfig } from './pds-config.type';

/**
 * Custom validator for base64-encoded 32-byte keys.
 * Validates that the decoded value is exactly 32 bytes.
 */
function validateBase64Key32(value: string | undefined, keyName: string): void {
  if (!value) return;

  try {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== 32) {
      throw new Error(
        `${keyName} must decode to exactly 32 bytes, got ${decoded.length}`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('must decode')) {
      throw error;
    }
    throw new Error(`${keyName} is not valid base64: ${error}`);
  }
}

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  PDS_URL: string;

  @IsString()
  @IsOptional()
  PDS_SERVICE_HANDLE_DOMAINS: string;

  @IsString()
  @IsOptional()
  PDS_ADMIN_PASSWORD: string;

  @IsBase64()
  @IsOptional()
  PDS_CREDENTIAL_KEY_1: string;

  @IsBase64()
  @IsOptional()
  PDS_CREDENTIAL_KEY_2: string;

  @IsString()
  @IsOptional()
  PDS_INVITE_CODE: string;
}

export default registerAs<PdsConfig>('pds', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  // Additional validation for key length (only if key is provided)
  if (process.env.PDS_CREDENTIAL_KEY_1) {
    validateBase64Key32(
      process.env.PDS_CREDENTIAL_KEY_1,
      'PDS_CREDENTIAL_KEY_1',
    );
  }

  if (process.env.PDS_CREDENTIAL_KEY_2) {
    validateBase64Key32(
      process.env.PDS_CREDENTIAL_KEY_2,
      'PDS_CREDENTIAL_KEY_2',
    );
  }

  return {
    url: process.env.PDS_URL || '',
    serviceHandleDomains: process.env.PDS_SERVICE_HANDLE_DOMAINS || '',
    adminPassword: process.env.PDS_ADMIN_PASSWORD || '',
    credentialKey1: process.env.PDS_CREDENTIAL_KEY_1 || '',
    credentialKey2: process.env.PDS_CREDENTIAL_KEY_2,
    inviteCode: process.env.PDS_INVITE_CODE,
  };
});
