import {
  HttpStatus,
  Inject,
  Injectable,
  Scope,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { SocialInterface } from '../social/interfaces/social.interface';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { AuthGoogleOAuth2Dto } from './dto/auth-google-oauth2.dto';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthGoogleService {
  private google: OAuth2Client;
  private tenantConfig: TenantConfig;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private tenantService: TenantConnectionService,
  ) {
    this.tenantConfig = this.tenantService.getTenantConfig(
      this.request.headers['x-tenant-id'],
    );
    this.google = new OAuth2Client(
      this.tenantConfig.googleClientId,
      this.tenantConfig.googleClientSecret,
    );
  }

  async getProfileByToken(
    loginDto: AuthGoogleLoginDto,
  ): Promise<SocialInterface> {
    const ticket = await this.google.verifyIdToken({
      idToken: loginDto.idToken,
      audience: [this.tenantConfig.googleClientId],
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
  ): Promise<SocialInterface> {
    try {
      // Exchange authorization code for tokens
      const { tokens } = await this.google.getToken({
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
      const ticket = await this.google.verifyIdToken({
        idToken: tokens.id_token,
        audience: [this.tenantConfig.googleClientId],
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

      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'invalidAuthorizationCode',
        },
      });
    }
  }
}
