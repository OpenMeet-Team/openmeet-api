import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Scope,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { SocialInterface } from '../social/interfaces/social.interface';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { AuthGoogleOAuth2Dto } from './dto/auth-google-oauth2.dto';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';
import { AuthService } from '../auth/auth.service';
import { OAuthPlatform } from '../auth/types/oauth.types';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthGoogleService {
  private readonly logger = new Logger(AuthGoogleService.name);
  private google: OAuth2Client | null = null;
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
      this.google = new OAuth2Client(
        this.tenantConfig.googleClientId,
        this.tenantConfig.googleClientSecret,
      );
    }
  }

  /**
   * Get or create OAuth2Client for the given tenant.
   * Used when tenant ID comes from state param instead of header.
   */
  private getGoogleClient(tenantId?: string): OAuth2Client {
    if (this.google) {
      return this.google;
    }

    if (!tenantId) {
      throw new UnprocessableEntityException('Tenant ID is required');
    }

    const config = this.tenantService.getTenantConfig(tenantId);
    return new OAuth2Client(config.googleClientId, config.googleClientSecret);
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
    loginDto: AuthGoogleLoginDto,
  ): Promise<SocialInterface> {
    const google = this.getGoogleClient();
    const config = this.getTenantConfig();

    const ticket = await google.verifyIdToken({
      idToken: loginDto.idToken,
      audience: [config.googleClientId],
    });

    const data = ticket.getPayload();

    if (!data) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'wrongToken',
        },
      });
    }

    return {
      id: data.sub,
      email: data.email,
      firstName: data.given_name,
      lastName: data.family_name,
    };
  }

  async getProfileByOAuth2Code(
    oauth2Dto: AuthGoogleOAuth2Dto,
    tenantId?: string,
  ): Promise<SocialInterface> {
    const google = this.getGoogleClient(tenantId);
    const config = this.getTenantConfig(tenantId);

    try {
      // Exchange authorization code for tokens
      const { tokens } = await google.getToken({
        code: oauth2Dto.code,
        redirect_uri: oauth2Dto.redirectUri,
      });

      if (!tokens.id_token) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            user: 'noIdToken',
          },
        });
      }

      // Verify the ID token (reusing existing logic)
      const ticket = await google.verifyIdToken({
        idToken: tokens.id_token,
        audience: [config.googleClientId],
      });

      const data = ticket.getPayload();

      if (!data) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            user: 'wrongToken',
          },
        });
      }

      // Return same format as existing method
      return {
        id: data.sub,
        email: data.email,
        firstName: data.given_name,
        lastName: data.family_name,
      };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }

      this.logger.error('Google OAuth token exchange failed', {
        error: error.message,
        response: error.response?.data,
      });

      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'invalidAuthorizationCode',
        },
      });
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

    return `${baseUrl}/auth/google/callback?${params.toString()}`;
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
    return `${backendDomain}/api/v1/auth/google/callback`;
  }

  /**
   * Handle the OAuth callback from Google.
   * Exchanges the code for tokens and validates the social login.
   */
  async handleCallback(
    code: string,
    tenantId: string,
    platform?: OAuthPlatform,
  ): Promise<{ redirectUrl: string; sessionId?: string }> {
    // Get the redirect URI that was used for this callback
    const redirectUri = this.getCallbackRedirectUri();
    this.logger.debug('handleCallback', { tenantId, platform, redirectUri });

    // Exchange code for tokens using existing method
    // Pass tenantId for lazy initialization (no x-tenant-id header on callback)
    const socialData = await this.getProfileByOAuth2Code(
      { code, redirectUri },
      tenantId,
    );

    // Validate social login
    const loginResponse = await this.authService.validateSocialLogin(
      'google',
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
