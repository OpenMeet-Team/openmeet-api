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
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface OidcUserInfo {
  sub: string; // User ID (slug)
  name: string;
  email: string;
  preferred_username: string;
  matrix_handle: string;
  tenant_id: string;
}

export interface OidcTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  id_token: string;
}

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private rsaKeyPair: { privateKey: string; publicKey: string };

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly sessionService: SessionService,
  ) {
    // Use persistent RSA key pair for RS256 signing
    this.rsaKeyPair = this.getOrGenerateRSAKeyPair();
  }

  /**
   * Get or generate persistent RSA key pair for RS256 JWT signing
   */
  private getOrGenerateRSAKeyPair(): { privateKey: string; publicKey: string } {
    // Check if we have persistent keys in environment variables
    const privateKeyEnv = process.env.OIDC_RSA_PRIVATE_KEY;
    const publicKeyEnv = process.env.OIDC_RSA_PUBLIC_KEY;

    if (privateKeyEnv && publicKeyEnv) {
      console.log('🔑 Using persistent RSA key pair from environment');
      return {
        privateKey: privateKeyEnv.replace(/\\n/g, '\n'),
        publicKey: publicKeyEnv.replace(/\\n/g, '\n'),
      };
    }

    // Generate new key pair and log it for persistence
    console.log(
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
        'matrix_handle',
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

    console.log('🔧 JWKS Debug - JWKS endpoint called');
    console.log(
      '🔧 JWKS Debug - Public key JWK:',
      JSON.stringify(jwk, null, 2),
    );

    return {
      keys: [
        {
          ...jwk,
          use: 'sig',
          kid: 'openmeet-oidc-rsa-key',
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
        const session = await sessionRepository.findOne({
          where: { id: Number(sessionId) },
          relations: ['user'],
        });

        if (session && session.user && !session.deletedAt) {
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
          const session = await sessionRepository.findOne({
            where: { id: Number(sessionId) },
            relations: ['user'],
          });

          if (session && session.user && !session.deletedAt) {
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
    // Validate client_id
    const validClientIds = ['matrix_synapse']; // Add more clients as needed
    if (!validClientIds.includes(params.client_id)) {
      throw new UnauthorizedException('Invalid client_id');
    }

    // Validate response_type
    if (params.response_type !== 'code') {
      throw new UnauthorizedException('Unsupported response_type');
    }

    // Validate redirect_uri (should be Matrix server's callback URL)
    const allowedRedirectUris = [
      'http://localhost:8448/_synapse/client/oidc/callback',
      'http://matrix-local.openmeet.test:8448/_synapse/client/oidc/callback',
      'https://matrix.openmeet.net/_synapse/client/oidc/callback',
      'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
    ];

    if (!allowedRedirectUris.includes(params.redirect_uri)) {
      throw new UnauthorizedException('Invalid redirect_uri');
    }

    // Generate authorization code
    const authCode = this.generateAuthCode(params, userId, tenantId);

    // Return authorization URL for redirect
    const redirectUrl = new URL(params.redirect_uri);
    redirectUrl.searchParams.set('code', authCode);
    if (params.state) {
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
    const authData = this.validateAuthCode(params.code);

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
    const userInfo = this.mapUserToOidcClaims(user, authData.tenantId);
    console.log(
      '🔧 OIDC User Claims Debug:',
      JSON.stringify(userInfo, null, 2),
    );

    const accessToken = this.generateAccessToken(userInfo);
    const idToken = this.generateIdToken(userInfo, clientId, authData.nonce);

    console.log('🔧 OIDC Token Response Debug:', {
      access_token: accessToken.substring(0, 50) + '...',
      id_token: idToken.substring(0, 50) + '...',
      token_type: 'Bearer',
      expires_in: 3600,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600, // 1 hour
      id_token: idToken,
    };
  }

  /**
   * Get user info from access token
   */
  @Trace('oidc.userinfo')
  // eslint-disable-next-line @typescript-eslint/require-await
  async getUserInfo(accessToken: string): Promise<OidcUserInfo> {
    try {
      const payload = this.jwtService.verify(accessToken);
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  /**
   * Generate authorization code (temporary, short-lived)
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
      state: params.state,
      nonce: params.nonce,
      exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
      userId,
      tenantId,
    };

    console.log('🔧 DEBUG: About to sign auth code JWT with RS256');
    return jwt.sign(payload, this.rsaKeyPair.privateKey, {
      algorithm: 'RS256' as const,
      header: { alg: 'RS256', kid: 'openmeet-oidc-rsa-key' },
    });
  }

  /**
   * Validate authorization code
   */
  private validateAuthCode(code: string): any {
    try {
      const payload = jwt.verify(code, this.rsaKeyPair.publicKey, {
        algorithms: ['RS256'],
      }) as any;

      if (payload.type !== 'auth_code') {
        throw new Error('Invalid code type');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired authorization code');
    }
  }

  /**
   * Validate OIDC client credentials
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async validateClient(
    clientId: string,
    clientSecret: string,
  ): Promise<void> {
    // TODO: Store client credentials securely (database or config)
    const validClients = {
      matrix_synapse: {
        secret:
          process.env.MATRIX_OIDC_CLIENT_SECRET || 'change-me-in-production',
        isPublic: true, // Back to public client - will implement RS256
      },
    };

    const client = validClients[clientId];
    if (!client) {
      throw new UnauthorizedException('Invalid client_id');
    }

    // For public clients, we don't require a client secret
    if (!client.isPublic && client.secret !== clientSecret) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    console.log('✅ OIDC Client Debug - Client validated:', {
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
      header: { alg: 'RS256', kid: 'openmeet-oidc-rsa-key' },
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
      header: { alg: 'RS256', kid: 'openmeet-oidc-rsa-key' },
    });
  }

  /**
   * Map OpenMeet user to OIDC claims
   */
  private mapUserToOidcClaims(user: any, tenantId: string): OidcUserInfo {
    // Extract Matrix handle from matrixUserId if available
    let matrixHandle = 'unknown';
    if (user.matrixUserId) {
      const match = user.matrixUserId.match(/@(.+):/);
      if (match) {
        matrixHandle = match[1];
      }
    } else {
      // Auto-generate Matrix handle from user slug or email for OIDC provisioning
      matrixHandle =
        user.slug || user.email?.split('@')[0] || `user-${user.id}`;
      // Ensure Matrix username compliance (lowercase, no special chars except -, _, .)
      matrixHandle = matrixHandle.toLowerCase().replace(/[^a-z0-9._-]/g, '');
      console.log(
        `🔧 OIDC Auto-generated Matrix handle for user ${user.id}: ${matrixHandle}`,
      );
    }

    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email?.split('@')[0] ||
      user.slug;

    return {
      sub: user.slug, // Use slug as stable user identifier
      name: displayName,
      email: user.email,
      preferred_username: matrixHandle,
      matrix_handle: matrixHandle,
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
}
