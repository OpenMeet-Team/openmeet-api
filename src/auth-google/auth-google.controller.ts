import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  SerializeOptions,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { AuthGoogleService } from './auth-google.service';
import { AuthGoogleLoginDto } from './dto/auth-google-login.dto';
import { LoginResponseDto } from '../auth/dto/login-response.dto';
import { Request } from 'express';

@ApiTags('Auth')
@Controller({
  path: 'auth/google',
  version: '1',
})
export class AuthGoogleController {
  constructor(
    private readonly authService: AuthService,
    private readonly authGoogleService: AuthGoogleService,
  ) {}

  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @SerializeOptions({
    groups: ['me'],
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: AuthGoogleLoginDto,
    @Req() request: Request,
  ): Promise<LoginResponseDto> {
    const tenantId = request.headers['x-tenant-id'] as string;
    const socialData = await this.authGoogleService.getProfileByToken(loginDto);

    const loginResult = await this.authService.validateSocialLogin(
      'google',
      socialData,
      tenantId,
    );

    return loginResult;
  }
}
