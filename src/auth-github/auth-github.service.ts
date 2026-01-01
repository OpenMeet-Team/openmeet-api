// api/src/auth-github/auth-github.service.ts
import {
  Inject,
  Injectable,
  Logger,
  Scope,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SocialInterface } from '../social/interfaces/social.interface';
import { AuthGithubLoginDto } from './dto/auth-github-login.dto';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';
import { AuthService } from '../auth/auth.service';
import { OAuthPlatform } from '../auth/types/oauth.types';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthGithubService {
  private readonly logger = new Logger(AuthGithubService.name);
  private tenantConfig: TenantConfig | null = null;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private tenantService: TenantConnectionService,
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    // Only initialize tenant config if x-tenant-id header is present
    // For callback endpoints, tenant ID comes from state param instead
    const tenantId = this.request?.headers?.['x-tenant-id'];
    if (tenantId) {
      this.tenantConfig = this.tenantService.getTenantConfig(tenantId);
    }
  }

  /**
   * Get tenant config, lazily loading if needed.
   */
  private getTenantConfig(tenantId?: string): TenantConfig {
    if (this.tenantConfig) {
      return this.tenantConfig;
    }

    if (!tenantId) {
      throw new UnprocessableEntityException('Tenant ID is required');
    }

    return this.tenantService.getTenantConfig(tenantId);
  }

  async getProfileByToken(
    loginDto: AuthGithubLoginDto,
  ): Promise<SocialInterface> {
    const config = this.getTenantConfig();

    try {
      // Exchange code for access token
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code: loginDto.code,
        },
        {
          headers: { Accept: 'application/json' },
        },
      );

      const accessToken = tokenResponse.data.access_token;

      // Get user profile with access token
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Get user email
      const emailsResponse = await axios.get(
        'https://api.github.com/user/emails',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const primaryEmail = emailsResponse.data.find(
        (email: any) => email.primary && email.verified,
      );

      if (!primaryEmail?.email) {
        throw new UnprocessableEntityException('Email not found');
      }

      return {
        id: userResponse.data.id.toString(),
        email: primaryEmail.email,
        firstName: userResponse.data.name?.split(' ')[0] || '',
        lastName: userResponse.data.name?.split(' ').slice(1).join(' ') || '',
      };
    } catch (error) {
      throw new UnprocessableEntityException(
        error.response?.data?.message || 'Invalid GitHub credentials',
      );
    }
  }

  /**
   * Get profile by authorization code.
   * This is a refactored version of the code exchange logic for reuse.
   */
  async getProfileByCode(
    code: string,
    tenantId?: string,
  ): Promise<SocialInterface> {
    const config = this.getTenantConfig(tenantId);

    try {
      // Exchange code for access token
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
        },
        {
          headers: { Accept: 'application/json' },
        },
      );

      const accessToken = tokenResponse.data.access_token;

      if (!accessToken) {
        throw new UnprocessableEntityException('Failed to get access token');
      }

      // Get user profile with access token
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Get user email
      const emailsResponse = await axios.get(
        'https://api.github.com/user/emails',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const primaryEmail = emailsResponse.data.find(
        (email: any) => email.primary && email.verified,
      );

      if (!primaryEmail?.email) {
        throw new UnprocessableEntityException('Email not found');
      }

      return {
        id: userResponse.data.id.toString(),
        email: primaryEmail.email,
        firstName: userResponse.data.name?.split(' ')[0] || '',
        lastName: userResponse.data.name?.split(' ').slice(1).join(' ') || '',
      };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }
      throw new UnprocessableEntityException(
        error.response?.data?.message || 'Invalid GitHub credentials',
      );
    }
  }

  /**
   * Build the redirect URL for OAuth callback based on platform.
   * Mobile platforms (android/ios) use custom URL scheme for deep linking.
   * Web uses the tenant's frontend domain.
   */
  public buildRedirectUrl(
    tenantId: string,
    params: URLSearchParams,
    platform?: OAuthPlatform,
  ): string {
    const tenantConfig = this.tenantService.getTenantConfig(tenantId);
    const isMobile = platform === 'android' || platform === 'ios';

    let baseUrl: string;
    if (isMobile) {
      const customScheme = this.configService.get<string>(
        'MOBILE_CUSTOM_URL_SCHEME',
        'net.openmeet.platform',
      );
      baseUrl = `${customScheme}:`;
    } else {
      baseUrl = tenantConfig.frontendDomain;
    }

    return `${baseUrl}/auth/github/callback?${params.toString()}`;
  }

  /**
   * Get the redirect URI for the callback endpoint.
   * This is used when exchanging the auth code for tokens.
   * Note: tenantId and platform are passed via state param, not query params,
   * because OAuth providers require exact redirect_uri matches.
   */
  public getCallbackRedirectUri(): string {
    const backendDomain = this.configService.get<string>(
      'BACKEND_DOMAIN',
      'http://localhost:3000',
    );
    return `${backendDomain}/api/v1/auth/github/callback`;
  }

  /**
   * Handle the OAuth callback from GitHub.
   * Exchanges the code for tokens and validates the social login.
   */
  async handleCallback(
    code: string,
    state: string,
    tenantId: string,
    platform?: OAuthPlatform,
  ): Promise<{ redirectUrl: string; sessionId?: string }> {
    this.logger.debug('handleCallback', { tenantId, platform });

    // Exchange code for profile using existing method
    // Pass tenantId for lazy initialization (no x-tenant-id header on callback)
    const socialData = await this.getProfileByCode(code, tenantId);

    // Validate social login
    const loginResponse = await this.authService.validateSocialLogin(
      'github',
      socialData,
      tenantId,
    );

    // Build redirect URL with token params
    const params = new URLSearchParams({
      token: loginResponse.token,
      refreshToken: loginResponse.refreshToken,
      tokenExpires: loginResponse.tokenExpires.toString(),
    });

    const redirectUrl = this.buildRedirectUrl(tenantId, params, platform);
    this.logger.debug('Redirecting to', { redirectUrl, platform });

    return {
      redirectUrl,
      sessionId: loginResponse.sessionId,
    };
  }
}
