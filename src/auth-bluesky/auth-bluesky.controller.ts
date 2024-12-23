import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  SerializeOptions,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { AuthBlueskyService } from './auth-bluesky.service';
import { AuthBlueskyLoginDto } from './dto/auth-bluesky-login.dto';
import { LoginResponseDto } from '../auth/dto/login-response.dto';

@ApiTags('Auth')
@Controller({
  path: 'auth/bluesky',
  version: '1',
})
export class AuthBlueskyController {
  constructor(
    private readonly authService: AuthService,
    private readonly authBlueskyService: AuthBlueskyService,
  ) {}

  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @SerializeOptions({
    groups: ['me'],
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: AuthBlueskyLoginDto): Promise<LoginResponseDto> {
    const socialData = await this.authBlueskyService.getProfileByToken(loginDto);
    return this.authService.validateSocialLogin('bluesky', socialData);
  }
} 