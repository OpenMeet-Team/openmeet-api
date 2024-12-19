// api/src/auth-github/auth-github.service.ts
import {
  Inject,
  Injectable,
  Scope,
  UnprocessableEntityException,
} from '@nestjs/common';
import axios from 'axios';
import { SocialInterface } from '../social/interfaces/social.interface';
import { AuthGithubLoginDto } from './dto/auth-github-login.dto';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthGithubService {
  private tenantConfig: TenantConfig;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private tenantService: TenantConnectionService,
  ) {
    this.tenantConfig = this.tenantService.getTenantConfig(
      this.request.headers['x-tenant-id'],
    );
  }

  async getProfileByToken(
    loginDto: AuthGithubLoginDto,
  ): Promise<SocialInterface> {
    try {
      // Exchange code for access token
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: this.tenantConfig.githubClientId,
          client_secret: this.tenantConfig.githubClientSecret,
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
}
