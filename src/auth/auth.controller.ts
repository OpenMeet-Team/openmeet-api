import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Request,
  Post,
  UseGuards,
  Patch,
  Delete,
  SerializeOptions,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthForgotPasswordDto } from './dto/auth-forgot-password.dto';
import { AuthConfirmEmailDto } from './dto/auth-confirm-email.dto';
import { AuthResetPasswordDto } from './dto/auth-reset-password.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthGuard } from '@nestjs/passport';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { NullableType } from '../utils/types/nullable.type';
import { User } from '../user/domain/user';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import { ShadowAccountService } from '../shadow-account/shadow-account.service';
import { ClaimShadowAccountDto } from './dto/claim-shadow-account.dto';
import { Roles } from './decorators/roles.decorator';
import { RoleEnum } from '../role/role.enum';
import { RolesGuard } from '../role/role.guard';
import { getOidcCookieOptions } from '../utils/cookie-config';
import { QuickRsvpDto } from './dto/quick-rsvp.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';

@ApiTags('Auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly shadowAccountService: ShadowAccountService,
  ) {}

  @SerializeOptions({
    groups: ['me'],
  })
  @Post('email/login')
  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body() loginDto: AuthEmailLoginDto,
    @Res({ passthrough: true }) response: Response,
    @Request() request,
  ): Promise<LoginResponseDto> {
    const loginResult = await this.service.validateLogin(
      loginDto,
      request.tenantId,
    );

    // Set oidc_session cookie for cross-domain OIDC authentication
    if (loginResult.sessionId) {
      const cookieOptions = getOidcCookieOptions();

      response.cookie('oidc_session', loginResult.sessionId, cookieOptions);
      response.cookie('oidc_tenant', request.tenantId, cookieOptions);
    }

    return loginResult;
  }

  @Post('email/register')
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: LoginResponseDto,
  })
  @HttpCode(HttpStatus.CREATED)
  public async register(
    @Body() createUserDto: AuthRegisterLoginDto,
    @Res({ passthrough: true }) response: Response,
    @Request() request,
  ): Promise<LoginResponseDto> {
    const loginResult = await this.service.register(
      createUserDto,
      request.tenantId,
    );

    // Set oidc_session cookie for cross-domain OIDC authentication
    if (loginResult.sessionId) {
      const cookieOptions = getOidcCookieOptions();

      response.cookie('oidc_session', loginResult.sessionId, cookieOptions);
      response.cookie('oidc_tenant', request.tenantId, cookieOptions);
    }

    return loginResult;
  }

  @Post('email/confirm')
  @ApiOkResponse({
    type: void 0,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  public confirmEmail(@Body() confirmEmailDto: AuthConfirmEmailDto) {
    return this.service.confirmEmail(confirmEmailDto.hash);
  }

  @Post('email/confirm/new')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmNewEmail(
    @Body() confirmEmailDto: AuthConfirmEmailDto,
  ): Promise<void> {
    return this.service.confirmNewEmail(confirmEmailDto.hash);
  }

  @Post('forgot/password')
  @ApiOkResponse({
    type: void 0,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  public forgotPassword(@Body() forgotPasswordDto: AuthForgotPasswordDto) {
    return this.service.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset/password')
  @ApiOkResponse({
    type: void 0,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  public resetPassword(@Body() resetPasswordDto: AuthResetPasswordDto) {
    return this.service.resetPassword(
      resetPasswordDto.hash,
      resetPasswordDto.password,
    );
  }

  @ApiBearerAuth()
  @SerializeOptions({
    groups: ['me'],
  })
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({
    type: User,
  })
  @HttpCode(HttpStatus.OK)
  public me(@Request() request): Promise<NullableType<User>> {
    return this.service.me(request.user);
  }

  @ApiBearerAuth()
  @SerializeOptions({
    groups: ['me'],
  })
  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({
    type: User,
  })
  @HttpCode(HttpStatus.OK)
  public update(
    @Request() request,
    @Body() userDto: AuthUpdateDto,
  ): Promise<NullableType<User>> {
    return this.service.update(request.user, userDto);
  }

  @ApiBearerAuth()
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(@Request() request): Promise<void> {
    await this.service.logout({
      sessionId: request.user.sessionId,
    });
  }

  @ApiOkResponse({
    type: RefreshResponseDto,
  })
  @ApiBearerAuth()
  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  public refresh(@Request() request): Promise<RefreshResponseDto> {
    return this.service.refreshToken(
      {
        sessionId: request.user.sessionId,
        hash: request.user.hash,
      },
      request.tenantId,
    );
  }

  @ApiBearerAuth()
  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(@Request() request): Promise<void> {
    return this.service.softDelete(request.user);
  }

  @ApiBearerAuth()
  @Post('internal/claim-shadow-account')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Shadow account claimed successfully',
  })
  public async claimShadowAccount(
    @Body() claimDto: ClaimShadowAccountDto,
    @Request() request,
  ) {
    const result = await this.shadowAccountService.claimShadowAccount(
      claimDto.userId,
      claimDto.externalId,
      claimDto.provider,
      request.tenantId,
    );

    return {
      success: !!result,
      message: result
        ? 'Shadow account claimed successfully'
        : 'No shadow account found to claim',
      userId: claimDto.userId,
    };
  }

  @Post('quick-rsvp')
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 attempts per minute to prevent spam RSVPs
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User created and RSVP registered. Verification email sent.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Event not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Event requires group membership',
  })
  public async quickRsvp(
    @Body() quickRsvpDto: QuickRsvpDto,
    @Request() request,
  ) {
    return this.service.quickRsvp(quickRsvpDto, request.tenantId);
  }

  @Post('verify-email-code')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute to prevent brute force
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Email verified successfully, user logged in',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired verification code',
  })
  public async verifyEmailCode(
    @Body() verifyEmailCodeDto: VerifyEmailCodeDto,
    @Res({ passthrough: true }) response: Response,
    @Request() request,
  ): Promise<LoginResponseDto> {
    const loginResult = await this.service.verifyEmailCode(
      verifyEmailCodeDto,
      request.tenantId,
    );

    // Set oidc_session cookie for cross-domain OIDC authentication (Matrix, etc.)
    // This was missing and prevented Matrix login after Quick RSVP
    if (loginResult.sessionId) {
      const cookieOptions = getOidcCookieOptions();

      response.cookie('oidc_session', loginResult.sessionId, cookieOptions);
      response.cookie('oidc_tenant', request.tenantId, cookieOptions);
    }

    return loginResult;
  }
}
