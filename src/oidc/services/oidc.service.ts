import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../../user/user.service';
import { Trace } from '../../utils/trace.decorator';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { fetchTenants } from '../../utils/tenant-config';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { SessionService } from '../../session/session.service';
import { SessionEntity } from '../../session/infrastructure/persistence/relational/entities/session.entity';
import { GlobalMatrixValidationService } from '../../matrix/services/global-matrix-validation.service';
import { ElastiCacheService } from '../../elasticache/elasticache.service';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface OidcUserInfo {
  sub: string; // User ID (slug)
  name: string;
  email: string;
  preferred_username: string;
  tenant_id: string;
}

export interface OidcTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  id_token: string;
  scope: string;
  // NOTE: state parameter removed - not part of OIDC token response spec
}

export interface RefreshTokenPayload {
  type: 'refresh_token';
  user_id: number;
  tenant_id: string;
  client_id: string;
  scope: string;
  access_token_id: string; // ID of the access token this refresh token is tied to
  iat: number;
  exp: number;
}

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private rsaKeyPair: { privateKey: string; publicKey: string };
  private readonly keyId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly sessionService: SessionService,
    private readonly globalMatrixValidationService: GlobalMatrixValidationService,
    private readonly elastiCacheService: ElastiCacheService,
  ) {
    // Use persistent RSA key pair for RS256 signing
    this.rsaKeyPair = this.getOrGenerateRSAKeyPair();

    // Configure key ID from environment or use default
    this.keyId =
      this.configService.get('oidc.keyId', { infer: true }) ||
      process.env.OIDC_KEY_ID ||
      'openmeet-oidc-rsa-key';

    this.logger.log(`🔑 OIDC using key ID: ${this.keyId}`);
  }

  /**
   * Get or generate persistent RSA key pair for RS256 JWT signing
   */
  private getOrGenerateRSAKeyPair(): { privateKey: string; publicKey: string } {
    // Check if we have persistent keys in environment variables
    const privateKeyEnv = process.env.OIDC_RSA_PRIVATE_KEY;
    const publicKeyEnv = process.env.OIDC_RSA_PUBLIC_KEY;

    if (privateKeyEnv && publicKeyEnv) {
      this.logger.debug('🔑 Using persistent RSA key pair from environment');
      return {
        privateKey: privateKeyEnv.replace(/\\n/g, '\n'),
        publicKey: publicKeyEnv.replace(/\\n/g, '\n'),
      };
    }

    // Generate new key pair and log it for persistence
    this.logger.debug(
      '🔑 Generating new RSA key pair (should be persisted in production)',
    );
    return this.generateRSAKeyPair();
  }

  /**
   * Generate RSA key pair for RS256 JWT signing
   */
  private generateRSAKeyPair(): { privateKey: string; publicKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return { privateKey, publicKey };
  }

  /**
   * Get OIDC discovery document (.well-known/openid-configuration)
   */
  @Trace('oidc.discovery')
  getDiscoveryDocument(baseUrl?: string) {
    // Use the provided base URL or fall back to config
    const issuerBaseUrl =
      baseUrl ||
      this.configService.get('app.oidcIssuerUrl', { infer: true }) ||
      'https://localdev.openmeet.net';
    const oidcIssuerUrl = `${issuerBaseUrl}/oidc`;
    const oidcApiBaseUrl = `${issuerBaseUrl}/api/oidc`;

    return {
      issuer: oidcIssuerUrl,
      authorization_endpoint: `${oidcApiBaseUrl}/auth`,
      token_endpoint: `${oidcApiBaseUrl}/token`,
      userinfo_endpoint: `${oidcApiBaseUrl}/userinfo`,
      jwks_uri: `${oidcApiBaseUrl}/jwks`,
      scopes_supported: ['openid', 'profile', 'email'],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: [
        'none', // Support public clients (no authentication required)
        'client_secret_post',
        'client_secret_basic',
      ],
      claims_supported: [
        'sub',
        'name',
        'email',
        'preferred_username',
        'tenant_id',
      ],
    };
  }

  /**
   * Get JWKS (JSON Web Key Set) for token verification
   */
  @Trace('oidc.jwks')
  getJwks() {
    // For RS256, we expose the public key in JWKS
    const publicKeyObject = crypto.createPublicKey(this.rsaKeyPair.publicKey);
    const jwk = publicKeyObject.export({ format: 'jwk' });

    this.logger.debug('🔧 JWKS Debug - JWKS endpoint called');
    this.logger.debug(
      '🔧 JWKS Debug - Public key JWK:',
      JSON.stringify(jwk, null, 2),
    );

    return {
      keys: [
        {
          ...jwk,
          use: 'sig',
          kid: this.keyId, // Use configurable key ID
          alg: 'RS256',
        },
      ],
    };
  }

  /**
   * Get user information from session ID for OIDC authentication
   */
  @Trace('oidc.getUserFromSession')
  async getUserFromSession(
    sessionId: string | number,
    tenantId?: string,
  ): Promise<{ id: number; tenantId: string } | null> {
    try {
      // If tenant ID provided, check that specific tenant
      if (tenantId) {
        const dataSource =
          await this.tenantConnectionService.getTenantConnection(tenantId);
        const sessionRepository = dataSource.getRepository(SessionEntity);

        // Use secureId for lookup (string) or fall back to numeric id for backwards compatibility
        const whereClause = typeof sessionId === 'string' && sessionId.includes('-')
          ? { secureId: sessionId }
          : { id: Number(sessionId) };

        const session = await sessionRepository.findOne({
          where: whereClause,
          relations: ['user'],
        });

        if (session && session.user && !session.deletedAt) {
          // Validate session freshness (max 24 hours for OIDC sessions)
          const sessionAge = Date.now() - session.createdAt.getTime();
          const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

          if (sessionAge > maxSessionAge) {
            this.logger.warn(
              `OIDC session ${sessionId} expired (age: ${Math.round(sessionAge / 1000 / 60)} minutes) - marking as deleted`,
            );
            // Mark the expired session as deleted to prevent future lookups
            session.deletedAt = new Date();
            await sessionRepository.save(session);
            return null;
          }

          return {
            id: session.user.id,
            tenantId: tenantId,
          };
        }
      }

      // If no tenant ID provided, try to find the session across tenants
      const tenants = await fetchTenants();
      for (const tenant of tenants) {
        try {
          const dataSource =
            await this.tenantConnectionService.getTenantConnection(tenant.id);
          const sessionRepository = dataSource.getRepository(SessionEntity);

          // Use secureId for lookup (string) or fall back to numeric id for backwards compatibility
          const whereClause = typeof sessionId === 'string' && sessionId.includes('-')
            ? { secureId: sessionId }
            : { id: Number(sessionId) };

          const session = await sessionRepository.findOne({
            where: whereClause,
            relations: ['user'],
          });

          if (session && session.user && !session.deletedAt) {
            // Validate session freshness (max 24 hours for OIDC sessions)
            const sessionAge = Date.now() - session.createdAt.getTime();
            const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

            if (sessionAge > maxSessionAge) {
              this.logger.warn(
                `OIDC session ${sessionId} expired (age: ${Math.round(sessionAge / 1000 / 60)} minutes) - marking as deleted`,
              );
              // Mark the expired session as deleted to prevent future lookups
              session.deletedAt = new Date();
              await sessionRepository.save(session);
              continue;
            }

            return {
              id: session.user.id,
              tenantId: tenant.id,
            };
          }
        } catch {
          // Session not found in this tenant, continue to next
          continue;
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get user from session:', error);
      return null;
    }
  }

  /**
   * Check if user has valid session using JWT token from browser
   * This is called when the frontend sends the JWT token for OIDC validation
   */
  validateUserTokenForOidc(
    _token: string,
  ): Promise<{ userId: number; tenantId: string } | null> {
    // We'll rely on the controller to validate the JWT token
    // This method is a placeholder for future enhancements
    return Promise.resolve(null);
  }

  /**
   * Handle authorization requests (start of OIDC flow)
   */
  @Trace('oidc.authorize')
  handleAuthorization(
    params: {
      client_id: string;
      redirect_uri: string;
      response_type: string;
      scope: string;
      state?: string;
      nonce?: string;
    },
    userId: number,
    tenantId: string,
  ) {
    // Validate client_id - get from environment for each deployment
    const validClientIds = [
      'matrix_synapse', // Legacy client ID
      '0000000000000000000SYNAPSE', // Synapse ULID client ID
      process.env.OAUTH_CLIENT_ID, // Environment-specific frontend client ID
      process.env.BOT_CLIENT_ID, // Environment-specific bot client ID
    ].filter(Boolean); // Remove undefined values
    this.logger.debug('🔧 OIDC Debug - Client validation:', {
      provided: params.client_id,
      valid: validClientIds,
      isValid: validClientIds.includes(params.client_id),
    });
    if (!validClientIds.includes(params.client_id)) {
      throw new UnauthorizedException(`Invalid client_id: ${params.client_id}`);
    }

    // Validate response_type
    if (params.response_type !== 'code') {
      throw new UnauthorizedException('Unsupported response_type');
    }

    // Validate redirect_uri with pattern matching for flexibility
    const allowedRedirectUriPatterns = [
      // Matrix Synapse callback URLs
      /^https?:\/\/localhost:8448\/_synapse\/client\/oidc\/callback$/,
      /^https?:\/\/matrix-local\.openmeet\.test:8448\/_synapse\/client\/oidc\/callback$/,
      /^https?:\/\/matrix.*\.openmeet\.net\/_synapse\/client\/oidc\/callback$/,
      // MAS callback URLs (restricted to known provider ID for security)
      /^https?:\/\/localhost:8081\/upstream\/callback\/01JAYS74TCG3BTWKADN5Q4518C$/,
      /^https?:\/\/matrix-auth-service:8080\/upstream\/callback\/01JAYS74TCG3BTWKADN5Q4518C$/,
      /^https?:\/\/mas.*\.openmeet\.net\/upstream\/callback\/01JAYS74TCG3BTWKADN5Q4518C$/,
      // MAS callback URLs for ngrok development
      /^https?:\/\/.*-mas\.ngrok\.app\/upstream\/callback\/01JAYS74TCG3BTWKADN5Q4518C$/,
      /^https?:\/\/om-mas\.ngrok\.app\/upstream\/callback\/01JAYS74TCG3BTWKADN5Q4518C$/,
      // Frontend callback URLs (for direct Matrix authentication)
      /^https?:\/\/localhost:9005\/.*$/,
      /^https?:\/\/platform.*\.openmeet\.net\/.*$/,
      /^https?:\/\/localdev\.openmeet\.net\/.*$/,
      // Frontend callback URLs for ngrok development
      /^https?:\/\/.*-platform\.ngrok\.app\/.*$/,
      /^https?:\/\/om-platform\.ngrok\.app\/.*$/,
    ];

    const isValidRedirectUri = allowedRedirectUriPatterns.some((pattern) =>
      pattern.test(params.redirect_uri),
    );

    this.logger.debug('🔧 OIDC Debug - Redirect URI validation:');
    this.logger.debug('  - Provided redirect_uri:', params.redirect_uri);
    this.logger.debug('  - Is valid:', isValidRedirectUri);
    this.logger.debug(
      '  - Patterns tested:',
      allowedRedirectUriPatterns.map((p) => p.toString()),
    );

    if (!isValidRedirectUri) {
      throw new UnauthorizedException('Invalid redirect_uri');
    }

    // Generate authorization code
    const authCode = this.generateAuthCode(params, userId, tenantId);

    // Return authorization URL for redirect
    const redirectUrl = new URL(params.redirect_uri);
    redirectUrl.searchParams.set('code', authCode);
    if (params.state !== undefined) {
      redirectUrl.searchParams.set('state', params.state);
    }

    return {
      redirect_url: redirectUrl.toString(),
      authorization_code: authCode,
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  @Trace('oidc.token')
  async exchangeCodeForTokens(params: {
    grant_type: string;
    code: string;
    redirect_uri: string;
    client_id: string;
    client_secret: string;
  }): Promise<OidcTokenResponse> {
    // Validate grant_type
    if (params.grant_type !== 'authorization_code') {
      throw new UnauthorizedException('Unsupported grant_type');
    }

    // Decode and validate authorization code first
    const authData = await this.validateAuthCode(params.code);

    this.logger.debug(
      '🔧 OIDC Token Exchange Debug - Validated auth code with Matrix state:',
      authData.matrix_original_state?.substring(0, 20) + '...',
    );

    // Validate redirect_uri matches the one from authorization request (OAuth 2.0 requirement)
    if (params.redirect_uri !== authData.redirect_uri) {
      this.logger.warn(
        `⚠️  OIDC Security - redirect_uri mismatch: expected "${authData.redirect_uri}", got "${params.redirect_uri}"`,
      );
      throw new UnauthorizedException(
        'redirect_uri does not match authorization request',
      );
    }

    // Use client_id from auth code if not provided in params
    const clientId = params.client_id || authData.client_id;

    // Validate client credentials
    await this.validateClient(clientId, params.client_secret);

    // Get user information
    const user = await this.userService.findById(
      authData.userId,
      authData.tenantId,
    );
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate tokens
    const userInfo = await this.mapUserToOidcClaims(user, authData.tenantId);
    this.logger.debug(
      '🔧 OIDC User Claims Debug:',
      JSON.stringify(userInfo, null, 2),
    );

    const accessToken = this.generateAccessToken(userInfo);
    const idToken = this.generateIdToken(userInfo, clientId, authData.nonce);

    // Generate refresh token (like MAS: long-lived, tied to access token)
    const refreshToken = this.generateRefreshToken(
      authData.userId,
      authData.tenantId,
      clientId,
      authData.scope || 'openid profile email',
      accessToken,
    );

    this.logger.debug('🔧 OIDC Token Response Debug:', {
      access_token: accessToken.substring(0, 50) + '...',
      refresh_token: refreshToken.substring(0, 50) + '...',
      id_token: idToken.substring(0, 50) + '...',
      token_type: 'Bearer',
      expires_in: 3600,
      state: authData.matrix_original_state
        ? authData.matrix_original_state.substring(0, 20) + '...'
        : 'none',
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour (like MAS: short-lived access tokens)
      refresh_token: refreshToken, // Add refresh token to response
      id_token: idToken,
      scope: authData.scope || 'openid profile email',
      // NOTE: state parameter should NOT be returned in token response per OIDC spec
      // Matrix handles state validation during authorization flow, not token exchange
    };
  }

  /**
   * Exchange refresh token for new access token (OAuth2 refresh_token grant)
   */
  @Trace('oidc.refresh_token')
  async refreshAccessToken(params: {
    grant_type: string;
    refresh_token: string;
    client_id?: string;
    client_secret?: string;
    scope?: string;
  }): Promise<OidcTokenResponse> {
    // Validate grant_type
    if (params.grant_type !== 'refresh_token') {
      throw new UnauthorizedException('Unsupported grant_type');
    }

    // Validate and decode refresh token
    let refreshPayload: RefreshTokenPayload;
    try {
      refreshPayload = jwt.verify(
        params.refresh_token,
        this.rsaKeyPair.publicKey,
        {
          algorithms: ['RS256'],
        },
      ) as RefreshTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (refreshPayload.type !== 'refresh_token') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Use client_id from refresh token if not provided
    const clientId = params.client_id || refreshPayload.client_id;

    // Validate client credentials
    await this.validateClient(clientId, params.client_secret);

    // Get user information
    const user = await this.userService.findById(
      refreshPayload.user_id,
      refreshPayload.tenant_id,
    );
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate new tokens
    const userInfo = await this.mapUserToOidcClaims(
      user,
      refreshPayload.tenant_id,
    );
    const accessToken = this.generateAccessToken(userInfo);
    const idToken = this.generateIdToken(userInfo, clientId);

    // Generate new refresh token (following OAuth2 best practice: refresh token rotation)
    const newRefreshToken = this.generateRefreshToken(
      refreshPayload.user_id,
      refreshPayload.tenant_id,
      clientId,
      params.scope || refreshPayload.scope,
      accessToken,
    );

    this.logger.debug('🔧 OIDC Refresh Token Debug:', {
      access_token: accessToken.substring(0, 50) + '...',
      refresh_token: newRefreshToken.substring(0, 50) + '...',
      id_token: idToken.substring(0, 50) + '...',
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour
      refresh_token: newRefreshToken, // New refresh token (rotation)
      id_token: idToken,
      scope: params.scope || refreshPayload.scope,
    };
  }

  /**
   * Get user info from access token
   */
  @Trace('oidc.userinfo')
  // eslint-disable-next-line @typescript-eslint/require-await
  async getUserInfo(accessToken: string): Promise<OidcUserInfo> {
    try {
      // Verify using the same RSA public key that was used to sign the token
      const payload = jwt.verify(accessToken, this.rsaKeyPair.publicKey, {
        algorithms: ['RS256'],
      }) as OidcUserInfo;
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  /**
   * Generate authorization code (temporary, short-lived)
   * IMPORTANT: Preserves Matrix session state to prevent "Invalid session for OIDC callback" errors
   */
  private generateAuthCode(
    params: any,
    userId: number,
    tenantId: string,
  ): string {
    const payload = {
      type: 'auth_code',
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      scope: params.scope,
      // CRITICAL: Preserve Matrix's state parameter exactly as received
      // This contains Matrix's session macaroon that must be returned unchanged
      state: params.state,
      nonce: params.nonce,
      exp: Math.floor(Date.now() / 1000) + 60, // 60 seconds (OAuth 2.0 best practice)
      userId,
      tenantId,
      // Store original Matrix state for session validation
      matrix_original_state: params.state,
    };

    this.logger.debug(
      '🔧 DEBUG: About to sign auth code JWT with RS256, preserving Matrix state:',
      params.state?.substring(0, 20) + '...',
    );
    return jwt.sign(payload, this.rsaKeyPair.privateKey, {
      algorithm: 'RS256' as const,
      header: { alg: 'RS256', kid: this.keyId },
    });
  }

  /**
   * Validate authorization code and check for reuse
   */
  private async validateAuthCode(code: string): Promise<any> {
    try {
      this.logger.debug('🔧 OIDC Auth Code Debug - Validating code...');
      const payload = jwt.verify(code, this.rsaKeyPair.publicKey, {
        algorithms: ['RS256'],
      }) as any;

      this.logger.debug(
        '🔧 OIDC Auth Code Debug - Decoded payload:',
        JSON.stringify(payload, null, 2),
      );

      if (payload.type !== 'auth_code') {
        this.logger.debug(
          '❌ OIDC Auth Code Debug - Invalid code type:',
          payload.type,
        );
        throw new Error('Invalid code type');
      }

      // Check if code has already been used (replay attack detection)
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const redisKey = `oidc:used_auth_code:${codeHash}`;

      const isUsed = await this.elastiCacheService.get<boolean>(redisKey);
      if (isUsed) {
        this.logger.error(
          `🚨 SECURITY ALERT: Authorization code reuse detected! Code: ${codeHash.substring(0, 16)}...`,
        );
        throw new UnauthorizedException(
          'Authorization code has already been used',
        );
      }

      // Mark code as used (TTL matches code expiry: 60 seconds + grace period)
      await this.elastiCacheService.set(redisKey, true, 120);

      this.logger.debug('✅ OIDC Auth Code Debug - Validation successful');
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.debug(
        '❌ OIDC Auth Code Debug - Validation failed:',
        error.message,
      );
      throw new UnauthorizedException('Invalid or expired authorization code');
    }
  }

  /**
   * Validate OIDC client credentials
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async validateClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<void> {
    // TODO: Store client credentials securely (database or config)
    // Build valid clients from environment configuration
    const validClients = {
      // Legacy Matrix Synapse client - public client (for backward compatibility)
      matrix_synapse: {
        secret:
          process.env.MATRIX_OIDC_CLIENT_SECRET || 'change-me-in-production',
        isPublic: true, // Public to maintain compatibility with existing Matrix deployments
        requireSecret: process.env.MATRIX_REQUIRE_CLIENT_SECRET === 'true', // Optional enforcement via env var
      },
      // ULID-based Synapse client - public client (for backward compatibility)
      '0000000000000000000SYNAPSE': {
        secret:
          process.env.MATRIX_OIDC_CLIENT_SECRET ||
          'local-dev-shared-secret-with-synapse',
        isPublic: true, // Public to maintain compatibility with existing Matrix deployments
        requireSecret: process.env.MATRIX_REQUIRE_CLIENT_SECRET === 'true', // Optional enforcement via env var
      },
    };

    // Add environment-specific clients
    if (process.env.OAUTH_CLIENT_ID) {
      validClients[process.env.OAUTH_CLIENT_ID] = {
        secret: process.env.OAUTH_CLIENT_SECRET,
        isPublic: process.env.OAUTH_CLIENT_IS_PUBLIC === 'true',
        requireSecret: process.env.OAUTH_REQUIRE_CLIENT_SECRET === 'true',
      };
    }
    if (process.env.BOT_CLIENT_ID) {
      validClients[process.env.BOT_CLIENT_ID] = {
        secret: process.env.BOT_CLIENT_SECRET,
        isPublic: false, // Bot client requires secret
        requireSecret: true,
      };
    }

    const client = validClients[clientId];
    if (!client) {
      throw new UnauthorizedException('Invalid client_id');
    }

    // Enforce client authentication based on client type and configuration
    if (client.requireSecret) {
      // Client requires secret (either confidential or configured to require it)
      if (!clientSecret) {
        this.logger.warn(
          `⚠️  OIDC Security - Client ${clientId} missing required client_secret`,
        );
        throw new UnauthorizedException(
          'client_secret required for this client',
        );
      }
      if (client.secret !== clientSecret) {
        this.logger.warn(
          `⚠️  OIDC Security - Invalid client_secret for client ${clientId}`,
        );
        throw new UnauthorizedException('Invalid client credentials');
      }
      this.logger.debug(
        `✅ OIDC Client Debug - Client validated with secret: ${clientId}`,
      );
    } else if (client.isPublic) {
      // Public client - optional secret validation
      if (clientSecret && client.secret !== clientSecret) {
        this.logger.warn(
          `⚠️  OIDC Security - Invalid client_secret for public client ${clientId}`,
        );
        throw new UnauthorizedException('Invalid client credentials');
      }
      this.logger.debug(
        `✅ OIDC Client Debug - Public client validated: ${clientId}`,
      );
    } else {
      // Confidential client without requireSecret flag - validate if secret provided
      if (clientSecret && client.secret !== clientSecret) {
        this.logger.warn(
          `⚠️  OIDC Security - Invalid client_secret for client ${clientId}`,
        );
        throw new UnauthorizedException('Invalid client credentials');
      }
      this.logger.debug(
        `✅ OIDC Client Debug - Client validated: ${clientId}`,
      );
    }

    this.logger.debug('✅ OIDC Client Debug - Client validated:', {
      clientId,
      isPublic: client.isPublic,
      hasSecret: !!clientSecret,
    });
  }

  /**
   * Generate access token
   */
  private generateAccessToken(userInfo: OidcUserInfo): string {
    const payload = {
      ...userInfo,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };

    return jwt.sign(payload, this.rsaKeyPair.privateKey, {
      algorithm: 'RS256' as const,
      header: { alg: 'RS256', kid: this.keyId },
    });
  }

  /**
   * Generate ID token (OIDC-specific)
   */
  private generateIdToken(
    userInfo: OidcUserInfo,
    clientId: string,
    nonce?: string,
  ): string {
    const payload: any = {
      ...userInfo,
      aud: clientId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: this.getDiscoveryDocument().issuer,
    };

    if (nonce) {
      payload.nonce = nonce;
    }

    return jwt.sign(payload, this.rsaKeyPair.privateKey, {
      algorithm: 'RS256' as const,
      header: { alg: 'RS256', kid: this.keyId },
    });
  }

  /**
   * Generate refresh token (long-lived, tied to access token)
   * Following MAS pattern: refresh tokens are JWT signed with RSA256
   */
  private generateRefreshToken(
    userId: number,
    tenantId: string,
    clientId: string,
    scope: string,
    accessToken: string,
  ): string {
    // Create a unique ID for the access token (hash of the token)
    const accessTokenId = crypto
      .createHash('sha256')
      .update(accessToken)
      .digest('hex')
      .substring(0, 16);

    const payload: RefreshTokenPayload = {
      type: 'refresh_token',
      user_id: userId,
      tenant_id: tenantId,
      client_id: clientId,
      scope,
      access_token_id: accessTokenId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days (long-lived like MAS)
    };

    return jwt.sign(payload, this.rsaKeyPair.privateKey, {
      algorithm: 'RS256' as const,
      header: { alg: 'RS256', kid: this.keyId },
    });
  }

  /**
   * Map OpenMeet user to OIDC claims
   */
  private async mapUserToOidcClaims(
    user: any,
    tenantId: string,
  ): Promise<OidcUserInfo> {
    // Get Matrix handle from global registry for preferred_username
    let preferredUsername: string;
    try {
      const registryEntry =
        await this.globalMatrixValidationService.getMatrixHandleForUser(
          user.id,
          tenantId,
        );

      if (registryEntry) {
        preferredUsername = registryEntry.handle;
        this.logger.debug(
          `🔧 OIDC Found Matrix handle for user ${user.id}: ${preferredUsername}`,
        );
      } else {
        // No Matrix handle registered yet - create and register it now
        const baseHandle =
          user.slug || user.email?.split('@')[0] || `user-${user.id}`;
        // Ensure Matrix username compliance (lowercase, no special chars except -, _, .)
        const cleanHandle = baseHandle
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, '');
        // Append tenant suffix for consistency with legacy users (lowercase for Matrix compliance)
        preferredUsername = `${cleanHandle}_${tenantId.toLowerCase()}`;

        // Register the Matrix handle in the database
        try {
          await this.globalMatrixValidationService.registerMatrixHandle(
            preferredUsername,
            tenantId,
            user.id,
          );
          this.logger.debug(
            `🔧 OIDC Registered new Matrix handle for user ${user.id}: ${preferredUsername}`,
          );
        } catch (error) {
          this.logger.error(
            `🔧 OIDC Error registering Matrix handle for user ${user.id}: ${error.message}`,
          );
          // Continue with the generated handle even if registration fails
        }

        this.logger.debug(
          `🔧 OIDC No Matrix handle found for user ${user.id}, created: ${preferredUsername}`,
        );
      }
    } catch (error) {
      console.warn(
        `🔧 OIDC Error getting Matrix handle for user ${user.id}: ${error.message}`,
      );
      // Fallback to generating from user data
      const baseHandle =
        user.slug || user.email?.split('@')[0] || `user-${user.id}`;
      const cleanHandle = baseHandle.toLowerCase().replace(/[^a-z0-9._-]/g, '');
      // Append tenant suffix for consistency with legacy users
      preferredUsername = `${cleanHandle}_${tenantId}`;
    }

    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email?.split('@')[0] ||
      user.slug;

    return {
      sub: user.slug, // Use slug as stable user identifier
      name: displayName,
      email: user.email,
      preferred_username: preferredUsername,
      tenant_id: tenantId,
    };
  }

  /**
   * Find user by email across all tenants
   * Returns the first tenant where the email is found
   */
  @Trace('oidc.findUserByEmail')
  async findUserByEmailAcrossTenants(
    email: string,
  ): Promise<{ user: UserEntity; tenantId: string } | null> {
    const tenants = fetchTenants();

    for (const tenant of tenants) {
      try {
        const connection =
          await this.tenantConnectionService.getTenantConnection(tenant.id);
        const userRepository = connection.getRepository(UserEntity);

        const user = await userRepository.findOne({
          where: { email: email.toLowerCase() },
        });

        if (user) {
          this.logger.log(`Found user ${email} in tenant ${tenant.id}`);
          return { user, tenantId: tenant.id };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to search tenant ${tenant.id} for email ${email}: ${error.message}`,
        );
        continue;
      }
    }

    this.logger.log(`Email ${email} not found in any tenant`);
    return null;
  }

  /**
   * Find user by session ID across all tenants
   * Returns the first tenant where the session ID is found
   */
  @Trace('oidc.findUserBySessionId')
  async findUserBySessionIdAcrossTenants(
    sessionId: number,
  ): Promise<{ user: UserEntity; tenantId: string } | null> {
    const tenants = fetchTenants();

    for (const tenant of tenants) {
      try {
        const connection =
          await this.tenantConnectionService.getTenantConnection(tenant.id);
        const sessionRepository = connection.getRepository('sessions');

        const session = await sessionRepository.findOne({
          where: { id: sessionId },
          relations: ['user'],
        });

        if (session && session.user) {
          this.logger.log(
            `Found session ${sessionId} in tenant ${tenant.id} for user ${session.user.id}`,
          );
          return { user: session.user, tenantId: tenant.id };
        }
      } catch (error) {
        this.logger.warn(
          `Failed to search tenant ${tenant.id} for session ${sessionId}: ${error.message}`,
        );
        continue;
      }
    }

    this.logger.log(`Session ${sessionId} not found in any tenant`);
    return null;
  }
}
