import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialInterface } from '../social/interfaces/social.interface';
import { FacebookInterface } from './interfaces/facebook.interface';
import { AuthFacebookLoginDto } from './dto/auth-facebook-login.dto';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class AuthFacebookService {
  constructor(private configService: ConfigService<AllConfigType>) {}

  async getProfileByToken(
    loginDto: AuthFacebookLoginDto,
  ): Promise<SocialInterface> {
    const fields = 'id,email,first_name,last_name';
    const url = `https://graph.facebook.com/v19.0/me?fields=${fields}&access_token=${encodeURIComponent(loginDto.accessToken)}`;

    const response = await fetch(url);
    const data: FacebookInterface = await response.json();

    if (!response.ok || !data.id) {
      throw new UnauthorizedException('Invalid Facebook access token');
    }

    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
    };
  }
}
