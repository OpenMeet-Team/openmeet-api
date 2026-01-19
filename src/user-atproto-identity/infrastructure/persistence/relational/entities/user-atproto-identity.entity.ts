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
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  did: string;

  /**
   * The user's AT Protocol handle (e.g., alice.dev.opnmt.me).
   * Can be null during account creation before handle is assigned.
   * Can change over time (handle migration).
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
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
   * Structure: { password: string }
   * Null for non-custodial accounts.
   *
   * SECURITY: Password should be encrypted at application level before storage.
   */
  @Column({ type: 'jsonb', nullable: true })
  pdsCredentials: { password: string } | null;

  /**
   * Whether OpenMeet manages this account (custodial) or user brought their own (non-custodial).
   */
  @Column({ type: 'boolean', default: true })
  isCustodial: boolean;

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
