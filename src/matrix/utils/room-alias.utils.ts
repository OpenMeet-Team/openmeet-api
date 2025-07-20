import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../../config/config.type';

export interface RoomAliasInfo {
  type: 'event' | 'group';
  slug: string;
  tenantId: string;
  roomAlias: string;
}

@Injectable()
export class RoomAliasUtils {
  private readonly logger = new Logger(RoomAliasUtils.name);

  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  /**
   * Generate a Matrix room alias for an event
   * Format: #event-{slug}-{tenantId}:matrix.openmeet.net
   */
  generateEventRoomAlias(eventSlug: string, tenantId: string): string {
    const serverName = this.getMatrixServerName();
    const roomAlias = `#event-${eventSlug}-${tenantId}:${serverName}`;
    this.logger.debug(`Generated event room alias: ${roomAlias}`);
    return roomAlias;
  }

  /**
   * Generate a Matrix room alias for a group
   * Format: #group-{slug}-{tenantId}:matrix.openmeet.net
   */
  generateGroupRoomAlias(groupSlug: string, tenantId: string): string {
    const serverName = this.getMatrixServerName();
    const roomAlias = `#group-${groupSlug}-${tenantId}:${serverName}`;
    this.logger.debug(`Generated group room alias: ${roomAlias}`);
    return roomAlias;
  }

  /**
   * Parse a Matrix room alias to extract entity information
   * Returns null if alias format is invalid
   */
  parseRoomAlias(roomAlias: string): RoomAliasInfo | null {
    try {
      this.logger.debug(`Parsing room alias: ${roomAlias}`);

      // Remove # prefix if present
      const aliasWithoutHash = roomAlias.startsWith('#') ? roomAlias.substring(1) : roomAlias;
      
      // Split by colon to get localpart and server
      const [localpart, serverName] = aliasWithoutHash.split(':');
      
      if (!localpart || !serverName) {
        this.logger.warn(`Invalid room alias format: ${roomAlias}`);
        return null;
      }

      // Parse localpart to extract entity information
      if (localpart.startsWith('event-')) {
        return this.parseEventRoomAlias(localpart, roomAlias);
      } else if (localpart.startsWith('group-')) {
        return this.parseGroupRoomAlias(localpart, roomAlias);
      } else {
        this.logger.warn(`Unknown room alias pattern: ${roomAlias}`);
        return null;
      }
    } catch (error) {
      this.logger.error(`Error parsing room alias ${roomAlias}: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse an event room alias localpart
   * Format: event-{slug}-{tenantId}
   */
  private parseEventRoomAlias(localpart: string, fullAlias: string): RoomAliasInfo | null {
    const parts = localpart.split('-');
    if (parts.length < 3 || parts[0] !== 'event') {
      this.logger.warn(`Invalid event room alias format: ${localpart}`);
      return null;
    }

    // Extract tenant ID (last part) and event slug (everything between event- and -{tenantId})
    const tenantId = parts[parts.length - 1];
    const eventSlug = parts.slice(1, -1).join('-');

    if (!tenantId || !eventSlug) {
      this.logger.warn(`Could not extract tenant ID or event slug from: ${localpart}`);
      return null;
    }

    return {
      type: 'event',
      slug: eventSlug,
      tenantId,
      roomAlias: fullAlias,
    };
  }

  /**
   * Parse a group room alias localpart
   * Format: group-{slug}-{tenantId}
   */
  private parseGroupRoomAlias(localpart: string, fullAlias: string): RoomAliasInfo | null {
    const parts = localpart.split('-');
    if (parts.length < 3 || parts[0] !== 'group') {
      this.logger.warn(`Invalid group room alias format: ${localpart}`);
      return null;
    }

    // Extract tenant ID (last part) and group slug (everything between group- and -{tenantId})
    const tenantId = parts[parts.length - 1];
    const groupSlug = parts.slice(1, -1).join('-');

    if (!tenantId || !groupSlug) {
      this.logger.warn(`Could not extract tenant ID or group slug from: ${localpart}`);
      return null;
    }

    return {
      type: 'group',
      slug: groupSlug,
      tenantId,
      roomAlias: fullAlias,
    };
  }

  /**
   * Validate if a room alias follows our expected patterns
   */
  isValidRoomAlias(roomAlias: string): boolean {
    const parsed = this.parseRoomAlias(roomAlias);
    return parsed !== null;
  }

  /**
   * Get the Matrix server name from configuration
   */
  private getMatrixServerName(): string {
    const matrixConfig = this.configService.get('matrix', { infer: true });
    return matrixConfig?.serverName || 'matrix.openmeet.net';
  }

  /**
   * Sanitize a slug for Matrix room alias usage
   * Matrix room aliases have specific character restrictions
   */
  sanitizeSlugForMatrix(slug: string): string {
    // Matrix room aliases can contain: lowercase letters, digits, hyphens, periods, underscores
    // Convert to lowercase and replace invalid characters with hyphens
    return slug
      .toLowerCase()
      .replace(/[^a-z0-9\-\._]/g, '-')
      .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }
}