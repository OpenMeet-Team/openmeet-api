import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';

/**
 * States of the take-ownership password-reset marker. See the
 * takeOwnershipStatus column doc for the meaning of each state.
 */
export type TakeOwnershipStatus = 'pending' | 'ambiguous' | 'confirmed';

/**
 * Entity representing a user's AT Protocol identity.
 *
 * Links OpenMeet users to their AT Protocol DID and PDS.
 * Supports both custodial (OpenMeet-managed) and non-custodial (user-owned) accounts.
 *
 * For custodial accounts:
 * - OpenMeet creates and manages the PDS account
 * - pdsCredentials stores encrypted password for API access
 * - isCustodial = true
 *
 * For non-custodial accounts (future):
 * - User brings their own DID/PDS
 * - pdsCredentials is null
 * - isCustodial = false
 */
@Entity({ name: 'userAtprotoIdentities' })
export class UserAtprotoIdentityEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Reference to the user's ULID in the users table.
   * One-to-one relationship: each user can have at most one AT Protocol identity.
   */
  @Column({ type: 'char', length: 26 })
  @Index({ unique: true })
  userUlid: string;

  /**
   * The user's decentralized identifier (DID).
   * Format: did:plc:xxxx or did:web:xxxx
   * Globally unique across all PDS instances.
   *
   * Note: unique: true creates an index automatically, so no explicit @Index() needed.
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  did: string;

  /**
   * The user's AT Protocol handle (e.g., alice.dev.opnmt.me).
   * Can be null during account creation before handle is assigned.
   * Can change over time (handle migration).
   *
   * Indexed for efficient lookups by handle.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  handle: string | null;

  /**
   * URL of the PDS hosting this user's data.
   * For custodial: https://pds-dev.openmeet.net or https://pds.openmeet.net
   * For non-custodial: any valid PDS URL
   */
  @Column({ type: 'varchar', length: 255 })
  pdsUrl: string;

  /**
   * Encrypted credentials for custodial accounts.
   *
   * This field stores the output of PdsCredentialService.encrypt(), which is
   * a JSON string containing: { v: 1|2, iv: string, ciphertext: string, authTag: string }
   *
   * The encrypted credential can be decrypted using PdsCredentialService.decrypt()
   * to retrieve the original password.
   *
   * Null for non-custodial accounts (user brings their own DID/PDS).
   *
   * SECURITY: Never log or expose this value. Use PdsCredentialService for all access.
   */
  @Column({ type: 'text', nullable: true })
  pdsCredentials: string | null;

  /**
   * Whether OpenMeet manages this account (custodial) or user brought their own (non-custodial).
   */
  @Column({ type: 'boolean', default: true })
  isCustodial: boolean;

  /**
   * Provenance record for the take-ownership password reset, written before
   * the reset is submitted to the PDS and advanced as evidence accumulates:
   *
   * - 'pending'   — a reset request was prepared; the PDS may never have
   *                 received it. Records intent only, NOT proof of a reset.
   * - 'ambiguous' — the PDS gave no definitive answer (timeout, 5xx); the
   *                 reset may have committed with the response lost, or the
   *                 request may never have arrived at all.
   * - 'confirmed' — the PDS acknowledged the reset but ending custody in the
   *                 same request failed; custody must still be ended.
   *
   * A PDS login 401 alone is ambiguous (the PDS returns the same 401 for
   * unknown accounts to prevent enumeration, so wrong PDS URL / incomplete
   * restore / deleted account all look like a bad password). Only
   * 'confirmed' authorizes automatically ending custody in response to a
   * 401; 'ambiguous' is surfaced for reconciliation instead, since its 401
   * could still be systemic, and 'pending' proves nothing.
   *
   * State changes go through the compare-and-set
   * transitionTakeOwnershipStatus so the marker only advances toward
   * stronger evidence; stale writers lose instead of overwriting. It is
   * only ever removed by proof: the custody flip itself, or a successful
   * login with the stored credentials (which shows no reset committed)
   * sweeping 'pending'/'ambiguous'. Rejection responses do not clear it — a
   * rejected retry cannot vouch for an earlier attempt whose token it may
   * itself have consumed.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  takeOwnershipStatus: TakeOwnershipStatus | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  /**
   * Relationship to User entity via userUlid.
   * Note: This uses a custom join column on ulid instead of the default id.
   */
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userUlid', referencedColumnName: 'ulid' })
  user?: UserEntity;
}
