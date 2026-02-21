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
  ApiOperation,
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
import { MeResponseDto, MeResponse } from './dto/me-response.dto';
import { ShadowAccountService } from '../shadow-account/shadow-account.service';
import { ClaimShadowAccountDto } from './dto/claim-shadow-account.dto';
import { Roles } from './decorators/roles.decorator';
import { RoleEnum } from '../role/role.enum';
import { RolesGuard } from '../role/role.guard';
import { getOidcCookieOptions } from '../utils/cookie-config';
import { QuickRsvpDto } from './dto/quick-rsvp.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { RequestLoginCodeDto } from './dto/request-login-code.dto';
import { RateLimit } from './guards/multi-layer-throttler.guard';
import {
  QUICK_RSVP_RATE_LIMITS,
  EMAIL_VERIFICATION_RATE_LIMITS,
  REQUEST_LOGIN_CODE_RATE_LIMITS,
} from './config/rate-limits.config';
import { AtprotoServiceAuthDto } from './dto/atproto-service-auth.dto';
import { AtprotoServiceAuthService } from './services/atproto-service-auth.service';
import { Public } from './decorators/public.decorator';

@ApiTags('Auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly shadowAccountService: ShadowAccountService,
    private readonly atprotoServiceAuthService: AtprotoServiceAuthService,
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
  })
  @HttpCode(HttpStatus.CREATED)
  public async register(
    @Body() createUserDto: AuthRegisterLoginDto,
    @Request() request,
  ): Promise<{ message: string; email: string }> {
    return await this.service.register(createUserDto, request.tenantId);
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
    type: MeResponseDto,
    description: 'User profile with AT Protocol identity',
  })
  @HttpCode(HttpStatus.OK)
  public me(@Request() request): Promise<NullableType<MeResponse>> {
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
  @Throttle({
    default: QUICK_RSVP_RATE_LIMITS.perIp,
  })
  @RateLimit({
    email: {
      limit: QUICK_RSVP_RATE_LIMITS.perEmail.limit,
      ttl: QUICK_RSVP_RATE_LIMITS.perEmail.ttl / 1000, // Convert ms to seconds
    },
    resource: {
      limit: QUICK_RSVP_RATE_LIMITS.perEvent.limit,
      ttl: QUICK_RSVP_RATE_LIMITS.perEvent.ttl / 1000, // Convert ms to seconds
      field: 'eventSlug',
      keyPrefix: 'event',
    },
    composite: {
      limit: QUICK_RSVP_RATE_LIMITS.composite.limit,
      ttl: QUICK_RSVP_RATE_LIMITS.composite.ttl / 1000, // Convert ms to seconds
      fields: ['email', 'eventSlug'],
      keyPrefix: 'user_event',
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({
    status: HttpStatus.CREATED,
    description:
      'User created and RSVP registered. Calendar invite email sent.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'User with this email already exists. Please log in to RSVP.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Event not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Event requires group membership',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded',
  })
  public async quickRsvp(
    @Body() quickRsvpDto: QuickRsvpDto,
    @Request() request,
  ) {
    return this.service.quickRsvp(quickRsvpDto, request.tenantId);
  }

  @SerializeOptions({
    groups: ['me'],
  })
  @Post('verify-email-code')
  @Throttle({
    default: EMAIL_VERIFICATION_RATE_LIMITS.perIp,
  })
  @RateLimit({
    email: {
      limit: EMAIL_VERIFICATION_RATE_LIMITS.perEmail.limit,
      ttl: EMAIL_VERIFICATION_RATE_LIMITS.perEmail.ttl / 1000, // Convert ms to seconds
    },
    composite: {
      limit: EMAIL_VERIFICATION_RATE_LIMITS.composite.limit,
      ttl: EMAIL_VERIFICATION_RATE_LIMITS.composite.ttl / 1000, // Convert ms to seconds
      fields: ['email', 'code'],
      keyPrefix: 'email_code',
    },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Email verified successfully, user logged in',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or expired verification code',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many verification attempts',
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

  @Post('request-login-code')
  @Throttle({
    default: REQUEST_LOGIN_CODE_RATE_LIMITS.perIp,
  })
  @RateLimit({
    email: {
      limit: REQUEST_LOGIN_CODE_RATE_LIMITS.perEmail.limit,
      ttl: REQUEST_LOGIN_CODE_RATE_LIMITS.perEmail.ttl / 1000, // Convert ms to seconds
    },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Login code request processed (email sent if account exists)',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many requests',
  })
  public async requestLoginCode(
    @Body() requestLoginCodeDto: RequestLoginCodeDto,
    @Request() request,
  ): Promise<{ success: boolean; message: string }> {
    return this.service.requestLoginCode(
      requestLoginCodeDto.email,
      request.tenantId,
    );
  }

  @Post('atproto/service-auth')
  @Public()
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a PDS-signed JWT for OpenMeet tokens',
    description:
      "Accepts a JWT from com.atproto.server.getServiceAuth, verifies it against the user's DID document, and returns OpenMeet access/refresh tokens.",
  })
  @ApiOkResponse({ type: LoginResponseDto })
  async atprotoServiceAuth(
    @Body() dto: AtprotoServiceAuthDto,
    @Request() request,
  ): Promise<LoginResponseDto> {
    return this.atprotoServiceAuthService.verifyAndExchange(
      dto.token,
      request.tenantId,
    );
  }
}
