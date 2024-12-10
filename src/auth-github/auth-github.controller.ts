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
import { AuthGithubService } from './auth-github.service';
import { AuthGithubLoginDto } from './dto/auth-github-login.dto';
import { LoginResponseDto } from '../auth/dto/login-response.dto';

@ApiTags('Auth')
@Controller({
  path: 'auth/github',
  version: '1',
})
export class AuthGithubController {
  constructor(
    private readonly authService: AuthService,
    private readonly authGithubService: AuthGithubService,
  ) {}

  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @SerializeOptions({
    groups: ['me'],
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: AuthGithubLoginDto): Promise<LoginResponseDto> {
    const socialData = await this.authGithubService.getProfileByToken(loginDto);

    return this.authService.validateSocialLogin('github', socialData);
  }
}
