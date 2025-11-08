import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'dns';
import { isIP } from 'net';

/**
 * Service for resolving Bluesky/ATProto identity information
 *
 * Handles:
 * - DID to handle resolution
 * - Handle to DID resolution
 * - Public profile lookups without authentication
 * - SSRF protection for PDS endpoints
 */
@Injectable()
export class BlueskyIdentityService {
  private readonly logger = new Logger(BlueskyIdentityService.name);

  // Default trusted PDS domains for production
  // Can be overridden via ATPROTO_ALLOWED_PDS_DOMAINS environment variable
  private readonly DEFAULT_ALLOWED_PDS_DOMAINS = [
    'bsky.network',
    'bsky.social',
    'atproto.com',
  ];

  private readonly ALLOWED_PDS_DOMAINS: string[];

  constructor(private readonly configService: ConfigService) {
    // Load PDS domains from environment variable if strict mode is desired
    // Format: comma-separated list, e.g., "bsky.network,bsky.social,custom.pds.com"
    const envDomains = this.configService.get('ATPROTO_ALLOWED_PDS_DOMAINS');

    if (envDomains) {
      this.ALLOWED_PDS_DOMAINS = envDomains
        .split(',')
        .map((d: string) => d.trim())
        .filter((d: string) => d.length > 0);

      this.logger.log(
        `🔒 STRICT MODE: Only allowing ${this.ALLOWED_PDS_DOMAINS.length} configured PDS domains`,
      );
    } else {
      this.ALLOWED_PDS_DOMAINS = [];
      this.logger.log(
        `🌐 PERMISSIVE MODE: Allowing any public PDS (decentralized ATProto). Internal IPs still blocked.`,
      );
    }
  }

  // Blocked IP ranges (SSRF protection)
  private readonly BLOCKED_IP_RANGES = [
    { start: '127.0.0.0', end: '127.255.255.255', name: 'Loopback' }, // 127.0.0.0/8
    { start: '10.0.0.0', end: '10.255.255.255', name: 'Private' }, // 10.0.0.0/8
    { start: '172.16.0.0', end: '172.31.255.255', name: 'Private' }, // 172.16.0.0/12
    { start: '192.168.0.0', end: '192.168.255.255', name: 'Private' }, // 192.168.0.0/16
    { start: '169.254.0.0', end: '169.254.255.255', name: 'Link-local/AWS' }, // 169.254.0.0/16
    { start: '0.0.0.0', end: '0.255.255.255', name: 'Reserved' }, // 0.0.0.0/8
    { start: '224.0.0.0', end: '239.255.255.255', name: 'Multicast' }, // 224.0.0.0/4
    { start: '240.0.0.0', end: '255.255.255.255', name: 'Reserved' }, // 240.0.0.0/4
  ];

  // Timeouts for external ATProto operations (in milliseconds)
  private readonly TIMEOUT_HANDLE_RESOLUTION = 5000; // 5 seconds
  private readonly TIMEOUT_PROFILE_FETCH = 10000; // 10 seconds
  private readonly TIMEOUT_DID_RESOLUTION = 3000; // 3 seconds

  /**
   * Convert IP string to numeric value for range comparison
   */
  private ipToNumber(ip: string): number {
    return ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
  }

  /**
   * Check if an IP is in a blocked range
   */
  private isBlockedIp(ip: string): boolean {
    if (!isIP(ip)) {
      return false;
    }

    const ipNum = this.ipToNumber(ip);

    for (const range of this.BLOCKED_IP_RANGES) {
      const startNum = this.ipToNumber(range.start);
      const endNum = this.ipToNumber(range.end);

      if (ipNum >= startNum && ipNum <= endNum) {
        this.logger.warn(
          `Blocked PDS endpoint resolving to ${range.name} range: ${ip}`,
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Create a timeout promise that rejects after specified milliseconds
   */
  private createTimeout<T>(timeoutMs: number, operation: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `ATProto operation timeout after ${timeoutMs}ms: ${operation}`,
          ),
        );
      }, timeoutMs);
    });
  }

  /**
   * Validate PDS endpoint to prevent SSRF attacks
   * Checks protocol, domain allowlist (in production), and DNS resolution
   */
  private async validatePdsEndpoint(pdsEndpoint: string): Promise<boolean> {
    try {
      const url = new URL(pdsEndpoint);

      // 1. Protocol whitelist - only allow http/https
      if (!['https:', 'http:'].includes(url.protocol)) {
        this.logger.warn(`Invalid protocol in PDS endpoint: ${url.protocol}`);
        return false;
      }

      // 2. Check if hostname is already an IP address
      if (isIP(url.hostname)) {
        if (this.isBlockedIp(url.hostname)) {
          this.logger.warn(
            `PDS endpoint uses blocked IP directly: ${url.hostname}`,
          );
          return false;
        }
      }

      // 3. Domain allowlist (OPTIONAL - only if explicitly configured)
      // By default, allow any public domain to support decentralized ATProto
      // Operators can restrict to specific domains via ATPROTO_ALLOWED_PDS_DOMAINS
      const envDomains = this.configService.get('ATPROTO_ALLOWED_PDS_DOMAINS');

      if (envDomains) {
        // Strict mode: only allow configured domains
        const isAllowed = this.ALLOWED_PDS_DOMAINS.some((domain) =>
          url.hostname.endsWith(domain),
        );

        if (!isAllowed) {
          this.logger.warn(
            `PDS endpoint not in configured allowlist: ${url.hostname}`,
          );
          return false;
        }
      }
      // If no allowlist configured, allow any public domain (default behavior)

      // 4. DNS resolution + IP validation
      // Resolve domain to IPs and check against blocklist
      try {
        const addresses = await dns.resolve4(url.hostname);

        for (const ip of addresses) {
          if (this.isBlockedIp(ip)) {
            this.logger.warn(
              `PDS endpoint ${url.hostname} resolves to blocked IP: ${ip}`,
            );
            return false;
          }
        }
      } catch (dnsError) {
        // DNS resolution failed - could be IPv6 only or invalid domain
        this.logger.warn(
          `DNS resolution failed for PDS endpoint ${url.hostname}: ${dnsError.message}`,
        );

        // If strict allowlist is configured, fail closed on DNS errors
        // Otherwise, allow it (might be IPv6-only or temporary DNS issue)
        if (envDomains) {
          this.logger.warn(
            `DNS resolution failed in strict mode, blocking: ${url.hostname}`,
          );
          return false;
        }

        // In permissive mode, log warning but allow through
        this.logger.warn(
          `DNS resolution failed but allowing in permissive mode: ${url.hostname}`,
        );
      }

      // All checks passed
      return true;
    } catch (error) {
      this.logger.error(`PDS endpoint validation error: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetches a public ATProtocol profile by DID or handle
   * Works without requiring user authentication - can be used for any ATProtocol user
   *
   * @param handleOrDid DID or handle to look up
   * @returns Profile information including resolved handle
   */
  async resolveProfile(handleOrDid: string): Promise<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    followersCount?: number;
    followingCount?: number;
    postsCount?: number;
    description?: string;
    indexedAt?: string;
    labels?: any[];
    source: string;
  }> {
    try {
      this.logger.debug(
        `Looking up public ATProtocol profile for: ${handleOrDid}`,
      );

      // Use require() to workaround ts-jest module resolution issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver, getPds, getHandle } = require('@atproto/identity');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Agent } = require('@atproto/api');

      // Create identity resolver (contains both handle and did resolvers)
      const idResolver = new IdResolver();

      // Resolve handle to DID if needed
      let did = handleOrDid;

      if (!handleOrDid.startsWith('did:')) {
        // If a handle was provided, resolve it to a DID first
        this.logger.debug(`Resolving handle ${handleOrDid} to DID`);

        // Add timeout to prevent hanging
        const resolvedDid = await Promise.race([
          idResolver.handle.resolve(handleOrDid),
          this.createTimeout<string>(
            this.TIMEOUT_HANDLE_RESOLUTION,
            'handle resolution',
          ),
        ]);

        if (!resolvedDid) {
          throw new Error(`Could not resolve handle ${handleOrDid} to a DID`);
        }
        did = resolvedDid;
        this.logger.debug(`Resolved ${handleOrDid} to ${did}`);
      }

      // Resolve DID to get the full DID document
      this.logger.debug(`Resolving DID ${did} to DID document`);

      // Add timeout to prevent hanging
      const didDoc = await Promise.race([
        idResolver.did.resolveNoCheck(did),
        this.createTimeout(this.TIMEOUT_DID_RESOLUTION, 'DID resolution'),
      ]);

      if (!didDoc) {
        throw new Error(`Could not resolve DID document for ${did}`);
      }

      // Extract PDS endpoint and handle from DID document
      const pdsEndpoint = getPds(didDoc);
      const handle = getHandle(didDoc);

      if (!pdsEndpoint) {
        throw new Error(`No PDS endpoint found for DID ${did}`);
      }

      this.logger.debug(`PDS endpoint for ${did}: ${pdsEndpoint}`);
      this.logger.debug(`Handle for ${did}: ${handle}`);

      // Validate PDS endpoint to prevent SSRF attacks
      const isValid = await this.validatePdsEndpoint(pdsEndpoint);
      if (!isValid) {
        throw new Error(`Untrusted or invalid PDS endpoint: ${pdsEndpoint}`);
      }

      // Create agent pointing to the user's PDS
      const agent = new Agent(pdsEndpoint);

      // Fetch profile data using DID or handle with timeout
      const response = await Promise.race([
        agent.getProfile({ actor: did }),
        this.createTimeout(this.TIMEOUT_PROFILE_FETCH, 'profile fetch'),
      ]);

      this.logger.debug(
        `Profile API response - did: ${response.data.did}, handle: ${response.data.handle}, handleFromDoc: ${handle}`,
      );

      // Format the response, using handle from DID document as fallback
      const resolvedHandle = response.data.handle || handle || did;
      this.logger.debug(`Final resolved handle: ${resolvedHandle}`);

      return {
        did: response.data.did,
        handle: resolvedHandle,
        displayName: response.data.displayName,
        avatar: response.data.avatar,
        followersCount: response.data.followersCount || 0,
        followingCount: response.data.followingCount || 0,
        postsCount: response.data.postsCount || 0,
        description: response.data.description,
        indexedAt: response.data.indexedAt,
        labels: response.data.labels || [],
        source: 'atprotocol-public',
      };
    } catch (error) {
      this.logger.error('Failed to fetch public ATProtocol profile', {
        error: error.message,
        stack: error.stack,
        handleOrDid,
      });

      throw new Error(
        `Unable to resolve profile for ${handleOrDid}: ${error.message}`,
      );
    }
  }

  /**
   * Lightweight handle-to-DID resolution without fetching full profile
   * Use this for profile lookups where you just need the DID
   *
   * @param handle The ATProto handle to resolve
   * @returns The DID or null if resolution fails
   */
  async resolveHandleToDid(handle: string): Promise<string | null> {
    try {
      this.logger.debug(`Resolving handle ${handle} to DID (lightweight)`);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver } = require('@atproto/identity');
      const idResolver = new IdResolver();

      // Add timeout to prevent hanging
      const did = await Promise.race([
        idResolver.handle.resolve(handle),
        this.createTimeout<string>(
          this.TIMEOUT_HANDLE_RESOLUTION,
          'handle to DID resolution',
        ),
      ]);

      if (!did) {
        this.logger.warn(`Could not resolve handle ${handle} to a DID`);
        return null;
      }

      this.logger.debug(`Resolved ${handle} to ${did}`);
      return did;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve handle ${handle} to DID: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Lightweight handle extraction from DID document
   * Fallback method when full profile fetch fails
   *
   * @param did The DID to extract handle from
   * @returns The handle or DID as fallback
   */
  async extractHandleFromDid(did: string): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IdResolver, getHandle } = require('@atproto/identity');
      const idResolver = new IdResolver();

      // Add timeout to prevent hanging
      const didDoc = await Promise.race([
        idResolver.did.resolveNoCheck(did),
        this.createTimeout(
          this.TIMEOUT_DID_RESOLUTION,
          'DID to handle extraction',
        ),
      ]);

      const handle = getHandle(didDoc);
      return handle || did;
    } catch (error) {
      this.logger.warn(
        `Failed to extract handle from DID document for ${did}: ${error.message}`,
      );
      return did; // Fallback to DID
    }
  }
}
