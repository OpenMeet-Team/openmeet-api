import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for AT Protocol identity response.
 *
 * This DTO intentionally excludes sensitive fields like pdsCredentials.
 */
export class AtprotoIdentityDto {
  @ApiProperty({
    description: 'Decentralized identifier (DID)',
    example: 'did:plc:abc123xyz789',
  })
  did: string;

  @ApiPropertyOptional({
    description: 'AT Protocol handle',
    example: 'alice.opnmt.me',
    nullable: true,
  })
  handle: string | null;

  @ApiProperty({
    description: 'URL of the PDS hosting this identity',
    example: 'https://pds.openmeet.net',
  })
  pdsUrl: string;

  @ApiProperty({
    description: 'Whether OpenMeet manages this account (custodial)',
    example: true,
  })
  isCustodial: boolean;

  @ApiProperty({
    description: 'Whether this identity is hosted on OpenMeet PDS',
    example: true,
  })
  isOurPds: boolean;

  @ApiProperty({
    description:
      'Whether this identity has an active AT Protocol OAuth session for publishing',
    example: true,
  })
  hasActiveSession: boolean;

  @ApiProperty({
    description: 'Valid handle domains for this PDS (e.g., [".bsky.dev.openmeet.net"])',
    example: ['.bsky.dev.openmeet.net'],
    type: [String],
  })
  validHandleDomains: string[];

  @ApiProperty({
    description: 'When the identity was created',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the identity was last updated',
  })
  updatedAt: Date;
}
