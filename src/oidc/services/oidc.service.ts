import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../../user/user.service';
import { Trace } from '../../utils/trace.decorator';

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

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get OIDC discovery document (.well-known/openid-configuration)
   */
  @Trace('oidc.discovery')
  getDiscoveryDocument() {
    const baseUrl =
      this.configService.get('app.baseUrl', { infer: true }) ||
      'http://localhost:3000';
    const oidcBaseUrl = `${baseUrl}/oidc`;

    return {
      issuer: oidcBaseUrl,
      authorization_endpoint: `${oidcBaseUrl}/auth`,
      token_endpoint: `${oidcBaseUrl}/token`,
      userinfo_endpoint: `${oidcBaseUrl}/userinfo`,
      jwks_uri: `${oidcBaseUrl}/jwks`,
      scopes_supported: ['openid', 'profile', 'email'],
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['HS256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_basic',
        'client_secret_post',
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
    // For HS256, we don't expose the secret in JWKS
    // Matrix server will use client_secret for verification
    return {
      keys: [
        {
          kty: 'oct', // Octet string for symmetric keys
          use: 'sig',
          kid: 'openmeet-oidc-key',
          alg: 'HS256',
        },
      ],
    };
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
      'http://matrix-local.openmeet.test:8448/_synapse/client/oidc/callback',
      'https://matrix.openmeet.net/_synapse/client/oidc/callback',
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

    // Validate client credentials
    await this.validateClient(params.client_id, params.client_secret);

    // Decode and validate authorization code
    const authData = this.validateAuthCode(params.code);

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
    const accessToken = this.generateAccessToken(userInfo);
    const idToken = this.generateIdToken(
      userInfo,
      params.client_id,
      authData.nonce,
    );

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

    return this.jwtService.sign(payload, { expiresIn: '10m' });
  }

  /**
   * Validate authorization code
   */
  private validateAuthCode(code: string): any {
    try {
      const payload = this.jwtService.verify(code);

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
      matrix_synapse:
        process.env.MATRIX_OIDC_CLIENT_SECRET || 'change-me-in-production',
    };

    if (!validClients[clientId] || validClients[clientId] !== clientSecret) {
      throw new UnauthorizedException('Invalid client credentials');
    }
  }

  /**
   * Generate access token
   */
  private generateAccessToken(userInfo: OidcUserInfo): string {
    return this.jwtService.sign(userInfo, { expiresIn: '1h' });
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
      iss: this.configService.get('app.baseUrl', { infer: true }) + '/oidc',
    };

    if (nonce) {
      payload.nonce = nonce;
    }

    return this.jwtService.sign(payload, { expiresIn: '1h' });
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
}
