import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO for the sync-atproto endpoint.
 * Actions align with PDS operations (createRecord, putRecord, deleteRecord).
 */
export class SyncAtprotoResponseDto {
  @ApiProperty({
    description: 'The PDS operation performed',
    enum: ['created', 'updated', 'deleted', 'skipped', 'error'],
    example: 'created',
  })
  action: 'created' | 'updated' | 'deleted' | 'skipped' | 'error';

  @ApiPropertyOptional({
    description: 'The AT Protocol URI of the published event record',
    example: 'at://did:plc:xxx/community.lexicon.calendar.event/abc123',
  })
  atprotoUri?: string;

  @ApiPropertyOptional({
    description: 'Error message when action is "error"',
    example: 'Link your AT Protocol account to publish events.',
  })
  error?: string;
}
