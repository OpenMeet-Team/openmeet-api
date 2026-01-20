/**
 * PDS (Personal Data Server) configuration type.
 *
 * Used for AT Protocol account provisioning and credential management.
 */
export interface PdsConfig {
  /** URL of the PDS instance (e.g., https://pds-dev.openmeet.net) */
  url: string;

  /** Comma-separated handle domains (e.g., ".dev.opnmt.me") */
  serviceHandleDomains: string;

  /** Admin password for PDS API access (Basic auth) */
  adminPassword: string;

  /** Base64-encoded 32-byte key for AES-256-GCM encryption (current key) */
  credentialKey1: string;

  /** Base64-encoded 32-byte key for AES-256-GCM encryption (previous key, for rotation) */
  credentialKey2?: string;

  /** Service invite code for custodial account creation (when PDS_INVITE_REQUIRED=true) */
  inviteCode?: string;
}
