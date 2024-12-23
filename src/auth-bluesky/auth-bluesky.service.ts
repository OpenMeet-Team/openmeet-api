import {
  Inject,
  Injectable,
  Scope,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BskyAgent } from '@atproto/api';
import { SocialInterface } from '../social/interfaces/social.interface';
import { AuthBlueskyLoginDto } from './dto/auth-bluesky-login.dto';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class AuthBlueskyService {
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
    loginDto: AuthBlueskyLoginDto,
  ): Promise<SocialInterface> {
    try {
      const agent = new BskyAgent({
        service: this.tenantConfig.blueskyConfig?.serviceUrl || 'https://bsky.social',
      });

      // Create session using the provided credentials
      const session = await agent.createSession({
        identifier: loginDto.identifier,
        password: loginDto.password,
      });

      // Get user profile
      const profile = await agent.getProfile({
        actor: session.did,
      });

      if (!profile.data.handle) {
        throw new UnprocessableEntityException('Profile not found');
      }

      return {
        id: profile.data.did,
        email: `${profile.data.handle}@bsky.social`, // Bluesky doesn't provide email
        firstName: profile.data.displayName?.split(' ')[0] || '',
        lastName: profile.data.displayName?.split(' ').slice(1).join(' ') || '',
        accessToken: session.accessJwt, // Store the JWT for future API calls
      };
    } catch (error) {
      throw new UnprocessableEntityException(
        error.response?.data?.message || 'Invalid Bluesky credentials',
      );
    }
  }
} 