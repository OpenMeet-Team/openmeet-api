import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PdsCredentialDecryptionError } from './pds.errors';
import { AllConfigType } from '../config/config.type';

/**
 * Structure of encrypted credentials stored in the database.
 */
interface EncryptedCredential {
  /** Key version (1 = KEY_1, 2 = KEY_2) */
  v: 1 | 2;
  /** Base64-encoded 12-byte nonce */
  iv: string;
  /** Base64-encoded encrypted data */
  ciphertext: string;
  /** Base64-encoded 16-byte authentication tag */
  authTag: string;
}

/**
 * Service for encrypting and decrypting PDS account credentials.
 *
 * Uses AES-256-GCM with:
 * - 32-byte keys (from PDS_CREDENTIAL_KEY_1 and PDS_CREDENTIAL_KEY_2)
 * - 12-byte random nonces
 * - 16-byte authentication tags
 *
 * Supports key rotation via version numbers (v:1 = KEY_1, v:2 = KEY_2).
 */
@Injectable()
export class PdsCredentialService {
  private readonly key1: Buffer | null;
  private readonly key2: Buffer | null;

  constructor(private readonly configService: ConfigService<AllConfigType>) {
    const key1Base64 = this.configService.get('pds.credentialKey1', {
      infer: true,
    });
    const key2Base64 = this.configService.get('pds.credentialKey2', {
      infer: true,
    });

    this.key1 = key1Base64 ? Buffer.from(key1Base64, 'base64') : null;
    this.key2 = key2Base64 ? Buffer.from(key2Base64, 'base64') : null;
  }

  /**
   * Encrypt a password using AES-256-GCM.
   *
   * Always uses KEY_1 (v:1) for new encryptions.
   *
   * @param password - The plaintext password to encrypt
   * @returns JSON string containing the encrypted credential
   */
  encrypt(password: string): string {
    return this.encryptWithVersion(password, 1);
  }

  /**
   * Encrypt a password with a specific key version.
   *
   * @param password - The plaintext password to encrypt
   * @param version - The key version to use (1 or 2)
   * @returns JSON string containing the encrypted credential
   */
  private encryptWithVersion(password: string, version: 1 | 2): string {
    const key = version === 1 ? this.key1 : this.key2;

    if (!key) {
      throw new PdsCredentialDecryptionError(
        `KEY_${version} is not configured`,
      );
    }

    // Generate random 12-byte IV
    const iv = crypto.randomBytes(12);

    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    // Encrypt the password
    const encrypted = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final(),
    ]);

    // Get the authentication tag
    const authTag = cipher.getAuthTag();

    // Build the credential structure
    const credential: EncryptedCredential = {
      v: version,
      iv: iv.toString('base64'),
      ciphertext: encrypted.toString('base64'),
      authTag: authTag.toString('base64'),
    };

    return JSON.stringify(credential);
  }

  /**
   * Decrypt an encrypted credential.
   *
   * @param encryptedJson - JSON string containing the encrypted credential
   * @returns The decrypted plaintext password
   * @throws PdsCredentialDecryptionError if decryption fails
   */
  decrypt(encryptedJson: string): string {
    let credential: EncryptedCredential;

    try {
      credential = JSON.parse(encryptedJson);
    } catch {
      throw new PdsCredentialDecryptionError(
        'Invalid encrypted credential format: not valid JSON',
      );
    }

    // Validate version and get the appropriate key
    const key = this.getKeyForVersion(credential.v);

    try {
      // Decode base64 values
      const iv = Buffer.from(credential.iv, 'base64');
      const ciphertext = Buffer.from(credential.ciphertext, 'base64');
      const authTag = Buffer.from(credential.authTag, 'base64');

      // Create decipher
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw new PdsCredentialDecryptionError(
        `Decryption failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /**
   * Get the encryption key for a specific version.
   *
   * @param version - The key version
   * @returns The encryption key buffer
   * @throws PdsCredentialDecryptionError if the version is unknown or key not configured
   */
  private getKeyForVersion(version: number): Buffer {
    if (version === 1) {
      if (!this.key1) {
        throw new PdsCredentialDecryptionError(
          'Credential requires KEY_1 but it is not configured',
        );
      }
      return this.key1;
    }

    if (version === 2) {
      if (!this.key2) {
        throw new PdsCredentialDecryptionError(
          'Credential requires KEY_2 but it is not configured',
        );
      }
      return this.key2;
    }

    throw new PdsCredentialDecryptionError(
      `Unknown credential version: ${version}`,
    );
  }
}
