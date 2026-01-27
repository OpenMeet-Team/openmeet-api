import {
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import ms from 'ms';
import crypto from 'crypto';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthProvidersEnum } from './auth-providers.enum';
import { SocialInterface } from '../social/interfaces/social.interface';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { NullableType } from '../utils/types/nullable.type';
import { LoginResponseDto } from './dto/login-response.dto';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshPayloadType } from './strategies/types/jwt-refresh-payload.type';
import { JwtPayloadType } from './strategies/types/jwt-payload.type';
import { UserService } from '../user/user.service';
import { AllConfigType } from '../config/config.type';
import { MailService } from '../mail/mail.service';
import { Session } from '../session/domain/session';
import { SessionService } from '../session/session.service';
import { StatusEnum } from '../status/status.enum';
import { User } from '../user/domain/user';
import { GroupService } from '../group/group.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { RoleService } from '../role/role.service';
import { RoleEnum } from '../role/role.enum';
import { StatusEntity } from 'src/status/infrastructure/persistence/relational/entities/status.entity';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventQueryService } from '../event/services/event-query.service';
import { REQUEST } from '@nestjs/core';
import { ShadowAccountService } from '../shadow-account/shadow-account.service';
import { EmailVerificationCodeService } from './services/email-verification-code.service';
import { QuickRsvpDto } from './dto/quick-rsvp.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { ForbiddenException } from '@nestjs/common';
import {
  EventAttendeeStatus,
  EventAttendeeRole,
} from '../core/constants/constant';
import { EventRoleService } from '../event-role/event-role.service';
import { PdsAccountService } from '../pds/pds-account.service';
import { PdsCredentialService } from '../pds/pds-credential.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';
import { PdsApiError } from '../pds/pds.errors';
import { MeResponse } from './dto/me-response.dto';
import { AtprotoIdentityDto } from '../atproto-identity/dto/atproto-identity.dto';

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name);
  constructor(
    private jwtService: JwtService,
    private userService: UserService,
    private groupService: GroupService,
    private groupMemberService: GroupMemberService,
    private sessionService: SessionService,
    private eventQueryService: EventQueryService,
    private eventAttendeeService: EventAttendeeService,
    private eventRoleService: EventRoleService,
    private mailService: MailService,
    private readonly roleService: RoleService,
    private shadowAccountService: ShadowAccountService,
    private emailVerificationCodeService: EmailVerificationCodeService,
    private configService: ConfigService<AllConfigType>,
    private pdsAccountService: PdsAccountService,
    private pdsCredentialService: PdsCredentialService,
    private userAtprotoIdentityService: UserAtprotoIdentityService,
    private blueskyIdentityService: BlueskyIdentityService,
    @Inject(REQUEST) private readonly request?: any,
  ) {}

  async validateLogin(
    loginDto: AuthEmailLoginDto,
    tenantId: string,
  ): Promise<LoginResponseDto> {
    const user = await this.userService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'User not found',
        },
      });
    }

    // console.log('[DEBUG] validateLogin - user loaded from database:', user);
    // console.log('[DEBUG] validateLogin - user.role:', user.role);

    if (user.provider !== AuthProvidersEnum.email) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: `Login via ${user.provider}`,
        },
      });
    }

    // Check if user has verified their email
    if (user.status?.id === StatusEnum.inactive) {
      // Ensure email is not null
      if (!user.email) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'User email is missing',
          },
        });
      }

      // Automatically send verification code
      this.logger.log(
        `User ${user.email} attempting login with unverified email. Sending verification code.`,
      );

      try {
        // Generate and send verification code
        const code = await this.emailVerificationCodeService.generateCode(
          user.id,
          tenantId,
          user.email,
        );

        await this.mailService.sendLoginCode({
          to: user.email,
          data: {
            name: user.firstName || 'there',
            code,
          },
        });

        this.logger.log(
          `Verification code sent to unverified user: ${user.email}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send verification code to ${user.email}:`,
          error,
        );
      }

      // Return special error that includes email_not_verified flag
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email:
            'Email not verified. A verification code has been sent to your email.',
          email_not_verified: true,
        },
      });
    }

    if (!user.password) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          password: 'Incorrect password',
        },
      });
    }

    const isValidPassword = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isValidPassword) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          password: 'Incorrect password',
        },
      });
    }

    // Auto-create AT Protocol identity for email users who don't have one
    await this.ensureAtprotoIdentity(
      user,
      AuthProvidersEnum.email,
      null,
      tenantId,
    );

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const secureId = crypto.randomUUID();

    this.logger.debug(`🔐 Creating new session for user: ${user.id}`);
    this.logger.debug(`Generated hash: ${hash.substring(0, 10)}...`);
    this.logger.debug(`Generated secureId: ${secureId}`);

    const session = await this.sessionService.create({
      user,
      hash,
      secureId,
    });

    this.logger.debug(`✅ Created session ID: ${session.id}`);

    const { token, refreshToken, tokenExpires } = await this.getTokensData({
      id: user.id,
      role: user.role,
      slug: user.slug,
      sessionId: session.secureId,
      hash,
      tenantId,
    });

    return {
      refreshToken,
      token,
      tokenExpires,
      user,
      sessionId: session.secureId,
    };
  }

  async validateSocialLogin(
    authProvider: string,
    socialData: SocialInterface,
    tenantId: string,
  ): Promise<LoginResponseDto> {
    this.logger.debug('validateSocialLogin', {
      authProvider,
      socialData,
      tenantId,
    });

    let user;
    try {
      user = await this.userService.findOrCreateUser(
        socialData,
        authProvider,
        tenantId,
      );
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        const errorData = error.getResponse() as any;
        // Re-throw social auth errors with more context for frontend handling
        if (errorData?.errors?.email) {
          throw new UnprocessableEntityException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            errors: {
              social_auth: errorData.errors.email,
              auth_provider: authProvider,
              suggested_provider: errorData.errors.email.includes('google')
                ? 'google'
                : errorData.errors.email.includes('github')
                  ? 'github'
                  : 'email',
            },
          });
        }
      }
      throw error;
    }

    if (!user) {
      this.logger.error('User not found or created', {
        socialData,
        authProvider,
        tenantId,
      });
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'userNotFound',
        },
      });
    }

    // Handle shadow accounts for Bluesky users
    if (authProvider === AuthProvidersEnum.bluesky && socialData.id) {
      // Case 1: Shadow account logging in for the first time - convert to real account
      if (user.isShadowAccount) {
        try {
          // Ensure the user has a role
          if (!user.role) {
            const roleEntity = await this.roleService.findByName(
              RoleEnum.User,
              tenantId,
            );

            if (!roleEntity) {
              throw new Error(`Role not found: ${RoleEnum.User}`);
            }

            user = await this.userService.update(
              user.id,
              {
                isShadowAccount: false,
                role: roleEntity,
              },
              tenantId,
            );
          } else {
            user = await this.userService.update(
              user.id,
              {
                isShadowAccount: false,
              },
              tenantId,
            );
          }

          this.logger.log(
            `Converted shadow account to real account for Bluesky user ${socialData.id} (user ID: ${user.id}) in tenant ${tenantId}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to convert shadow account to real account for user ${user.id}: ${error.message}`,
          );
          // Don't fail the login, but log the error
        }
      }
      // Case 2: Real user logging in - claim any existing shadow account
      else {
        try {
          const claimedUser =
            await this.shadowAccountService.claimShadowAccount(
              user.id,
              socialData.id,
              AuthProvidersEnum.bluesky,
              tenantId,
            );

          if (claimedUser) {
            this.logger.log(
              `Automatically claimed shadow account for Bluesky user ${socialData.id} in tenant ${tenantId}`,
            );
          }
        } catch (error) {
          // Log the error but don't fail the login if claiming fails
          this.logger.warn(
            `Failed to automatically claim shadow account for user ${user.id}: ${error.message}`,
          );
        }
      }
    }

    // Auto-create AT Protocol identity for users who don't have one
    await this.ensureAtprotoIdentity(user, authProvider, socialData, tenantId);

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const secureId = crypto.randomUUID();

    const session = await this.sessionService.create(
      {
        user,
        hash,
        secureId,
      },
      tenantId,
    );

    const { token, refreshToken, tokenExpires } = await this.getTokensData({
      id: user.id,
      role: user.role,
      slug: user.slug,
      sessionId: session.secureId,
      hash,
      tenantId,
    });

    return {
      refreshToken,
      token,
      tokenExpires,
      user,
      sessionId: session.secureId,
    };
  }

  async register(dto: AuthRegisterLoginDto, tenantId: string): Promise<any> {
    const role = await this.roleService.findByName(RoleEnum.User);
    if (!role) {
      throw new Error(`Role not found: ${RoleEnum.User}`);
    }

    // Create user as INACTIVE - requires email verification before login
    // A 6-digit verification code will be sent to their email
    const user = await this.userService.create({
      ...dto,
      lastName: dto.lastName ?? null,
      email: dto.email,
      role: role.id,
      status: {
        id: StatusEnum.inactive,
      },
    });

    // Generate 6-digit verification code
    const code = await this.emailVerificationCodeService.generateCode(
      user.id,
      tenantId,
      dto.email,
    );

    // Send verification email with 6-digit code
    await this.mailService.sendLoginCode({
      to: dto.email,
      data: {
        name: dto.firstName || 'User',
        code,
      },
    });

    this.logger.log(
      `Verification email sent to ${dto.email} (user ${user.id}, tenant ${tenantId})`,
    );

    return {
      message:
        'Registration successful. Please check your email to verify your account.',
      email: dto.email,
    };
  }

  async confirmEmail(hash: string): Promise<void> {
    let userId: User['id'];

    try {
      const jwtData = await this.jwtService.verifyAsync<{
        confirmEmailUserId: User['id'];
      }>(hash, {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
      });

      userId = jwtData.confirmEmailUserId;
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: `invalidHash`,
        },
      });
    }

    const user = await this.userService.findById(userId);
    if (
      !user ||
      user?.status?.id?.toString() !== StatusEnum.inactive.toString()
    ) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        error: `notFound`,
      });
    }

    user.status = {
      id: StatusEnum.active,
    } as StatusEntity;

    await this.userService.update(user.id, user);
  }

  async confirmNewEmail(hash: string): Promise<void> {
    let userId: User['id'];
    let newEmail: User['email'];

    try {
      const jwtData = await this.jwtService.verifyAsync<{
        confirmEmailUserId: User['id'];
        newEmail: User['email'];
      }>(hash, {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
      });

      userId = jwtData.confirmEmailUserId;
      newEmail = jwtData.newEmail;
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: `invalidHash`,
        },
      });
    }

    const user = await this.userService.findById(userId);

    if (!user) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        error: `notFound`,
      });
    }

    user.email = newEmail;
    user.status = {
      id: StatusEnum.active,
    } as StatusEntity;

    await this.userService.update(user.id, user);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          email: 'emailNotExists',
        },
      });
    }

    const tokenExpiresIn = this.configService.getOrThrow('auth.forgotExpires', {
      infer: true,
    });

    const tokenExpires = Date.now() + ms(tokenExpiresIn);

    const hash = await this.jwtService.signAsync(
      {
        forgotUserId: user.id,
      },
      {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
        expiresIn: tokenExpiresIn,
      },
    );

    await this.mailService.forgotPassword({
      to: email,
      data: {
        hash,
        tokenExpires,
      },
    });
  }

  async resetPassword(hash: string, password: string): Promise<void> {
    let userId: User['id'];

    try {
      const jwtData = await this.jwtService.verifyAsync<{
        forgotUserId: User['id'];
      }>(hash, {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
      });

      userId = jwtData.forgotUserId;
    } catch {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: `invalidHash`,
        },
      });
    }

    const user = await this.userService.findById(userId);

    if (!user) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          hash: `notFound`,
        },
      });
    }

    user.password = password;

    // If user is inactive (shadow account from Quick RSVP), activate them
    // Password reset via email link proves email ownership and verification
    if (user.status?.id === StatusEnum.inactive) {
      user.status = { id: StatusEnum.active } as StatusEntity;
      this.logger.log(
        `Activating previously inactive user ${user.id} via password reset`,
      );
    }

    await this.sessionService.deleteByUserId({
      userId: user.id,
    });

    await this.userService.update(user.id, user);
  }

  async me(userJwtPayload: JwtPayloadType): Promise<NullableType<MeResponse>> {
    try {
      const user = await this.userService.findById(userJwtPayload.id);

      if (!user) {
        return null;
      }

      // Resolve Bluesky handle dynamically if user exists
      // This ensures /auth/me returns current handle, not stale database value
      // See commit c3e042f for design rationale on dynamic handle resolution
      await this.userService.resolveBlueskyHandle(user);

      // Get AT Protocol identity if it exists
      const tenantId = this.request?.tenantId;
      let atprotoIdentity: AtprotoIdentityDto | null = null;

      if (tenantId && user.ulid) {
        const identity = await this.userAtprotoIdentityService.findByUserUlid(
          tenantId,
          user.ulid,
        );

        if (identity) {
          // Map to DTO, explicitly excluding pdsCredentials
          const ourPdsUrl = this.configService.get('pds.url', { infer: true });
          atprotoIdentity = {
            did: identity.did,
            handle: identity.handle,
            pdsUrl: identity.pdsUrl,
            isCustodial: identity.isCustodial,
            isOurPds: identity.pdsUrl === ourPdsUrl,
            hasActiveSession:
              identity.isCustodial && !!identity.pdsCredentials,
            createdAt: identity.createdAt,
            updatedAt: identity.updatedAt,
          };
        }
      }

      // Return user with atprotoIdentity as a proper class instance
      // so that @Exclude decorators are applied during serialization.
      // The groups: ['me'] option is required because some User properties
      // use @Expose({ groups: ['me'] }) which filters during plainToInstance.
      return plainToInstance(
        User,
        { ...user, atprotoIdentity },
        { groups: ['me'] },
      ) as MeResponse;
    } catch (error) {
      this.logger.error('Error in me() method:', {
        userId: userJwtPayload.id,
        error: error.message,
        stack: error.stack,
      });

      // If it's a database/tenant connection issue, throw a proper HTTP exception
      if (
        error.message?.includes('Tenant ID is required') ||
        error.message?.includes('Connection') ||
        error.message?.includes('database')
      ) {
        throw new UnauthorizedException('Authentication session expired');
      }

      // For other errors, also treat as unauthorized to be safe
      throw new UnauthorizedException('User authentication failed');
    }
  }

  async update(
    userJwtPayload: JwtPayloadType,
    userDto: AuthUpdateDto,
  ): Promise<NullableType<User>> {
    const currentUser = await this.userService.findById(userJwtPayload.id);

    if (!currentUser) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'userNotFound',
        },
      });
    }

    if (userDto.password) {
      // Case 1: User has existing password - require old password verification
      if (currentUser.password) {
        if (!userDto.oldPassword) {
          throw new UnprocessableEntityException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            errors: {
              oldPassword: 'missingOldPassword',
            },
          });
        }

        const isValidOldPassword = await bcrypt.compare(
          userDto.oldPassword,
          currentUser.password,
        );

        if (!isValidOldPassword) {
          throw new UnprocessableEntityException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            errors: {
              oldPassword: 'Incorrect current password',
            },
          });
        }

        // Valid password change - invalidate other sessions
        await this.sessionService.deleteByUserIdWithExcludeSecureId({
          userId: currentUser.id,
          excludeSecureId: userJwtPayload.sessionId,
        });
      }
      // Case 2: Passwordless user setting initial password
      // No old password required, just validate new password is provided
      else {
        this.logger.log(
          `User ${currentUser.id} (${currentUser.email}) setting initial password`,
        );

        // Still invalidate other sessions for security
        await this.sessionService.deleteByUserIdWithExcludeSecureId({
          userId: currentUser.id,
          excludeSecureId: userJwtPayload.sessionId,
        });
      }
    }

    if (userDto.email && userDto.email !== currentUser.email) {
      const userByEmail = await this.userService.findByEmail(userDto.email);

      if (userByEmail && userByEmail.id !== currentUser.id) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'This email is already in use.',
          },
        });
      }

      const hash = await this.jwtService.signAsync(
        {
          confirmEmailUserId: currentUser.id,
          newEmail: userDto.email,
        },
        {
          secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
            infer: true,
          }),
          expiresIn: this.configService.getOrThrow('auth.confirmEmailExpires', {
            infer: true,
          }),
        },
      );

      await this.mailService.confirmNewEmail({
        to: userDto.email,
        data: {
          hash,
        },
      });
    }

    delete userDto.email;
    delete userDto.oldPassword;

    await this.userService.update(userJwtPayload.id, userDto);

    return this.userService.findById(userJwtPayload.id);
  }

  async refreshToken(
    data: Pick<JwtRefreshPayloadType, 'sessionId' | 'hash'>,
    tenantId: string,
  ): Promise<Omit<LoginResponseDto, 'user'>> {
    this.logger.debug(`🔄 Starting refresh for sessionId: ${data.sessionId}`);
    const session = await this.sessionService.findBySecureId(
      data.sessionId,
      tenantId,
    );

    if (!session) {
      this.logger.warn(`❌ Session not found for sessionId: ${data.sessionId}`);
      throw new UnauthorizedException();
    }

    this.logger.debug(`🔄 Found session: ${session.id}`);
    this.logger.debug(`Session deletedAt: ${session.deletedAt}`);
    this.logger.debug(`Client hash: ${data.hash?.substring(0, 10)}...`);
    this.logger.debug(`Server hash: ${session.hash?.substring(0, 10)}...`);
    this.logger.debug(`Hashes match: ${session.hash === data.hash}`);

    if (session.hash !== data.hash) {
      this.logger.warn('❌ Hash mismatch detected');
      this.logger.debug(`Client hash: ${data.hash}`);
      this.logger.debug(`Server hash: ${session.hash}`);
      throw new UnauthorizedException();
    }

    this.logger.debug('✅ Hash validation passed, proceeding with refresh');

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    this.logger.debug(`🔄 Generated new hash: ${hash.substring(0, 10)}...`);

    const user = await this.userService.findById(session.user.id);

    if (!user?.role) {
      throw new UnauthorizedException();
    }

    this.logger.debug(`🔄 Updating session ${session.id} with new hash`);
    await this.sessionService.update(session.id, {
      hash,
    });
    this.logger.debug('✅ Session hash updated successfully');

    const { token, refreshToken, tokenExpires } = await this.getTokensData({
      id: session.user.id,
      role: {
        id: user.role.id,
      },
      slug: user.slug,
      sessionId: session.secureId,
      hash,
      tenantId,
    });

    return {
      token,
      refreshToken,
      tokenExpires,
    };
  }

  async softDelete(user: User): Promise<void> {
    await this.userService.remove(user.id);
  }

  async logout(data: Pick<JwtRefreshPayloadType, 'sessionId'>) {
    return this.sessionService.deleteBySecureId(data.sessionId);
  }

  private async getTokensData(data: {
    id: User['id'];
    role: User['role'];
    slug: User['slug'];
    sessionId: Session['id'];
    hash: Session['hash'];
    tenantId: string;
  }) {
    const tokenExpiresIn = this.configService.getOrThrow('auth.expires', {
      infer: true,
    });

    const tokenExpires = Date.now() + ms(tokenExpiresIn);

    // console.log(
    //   '[DEBUG] getTokensData - role before token creation:',
    //   data.role,
    // );

    const [token, refreshToken] = await Promise.all([
      await this.jwtService.signAsync(
        {
          id: data.id,
          role: data.role,
          slug: data.slug,
          sessionId: data.sessionId,
          tenantId: data.tenantId,
        },
        {
          secret: this.configService.getOrThrow('auth.secret', { infer: true }),
          expiresIn: tokenExpiresIn,
        },
      ),
      await this.jwtService.signAsync(
        {
          sessionId: data.sessionId,
          hash: data.hash,
        },
        {
          secret: this.configService.getOrThrow('auth.refreshSecret', {
            infer: true,
          }),
          expiresIn: this.configService.getOrThrow('auth.refreshExpires', {
            infer: true,
          }),
        },
      ),
    ]);

    // Decode the token to see what was actually put in it
    // const decoded = this.jwtService.decode(token);
    // console.log('[DEBUG] getTokensData - decoded token payload:', decoded);

    return {
      token,
      refreshToken,
      tokenExpires,
    };
  }

  async getUserPermissions(userId: number) {
    const user = await this.userService.findById(userId);
    if (!user || !user.role) {
      return [];
    }

    // Get permissions from user's role
    const rolePermissions = user.role.permissions || [];

    // Get any additional user-specific permissions
    const userPermissions = await this.userService.getUserPermissions(userId);

    // Combine and deduplicate permissions
    return [...new Set([...rolePermissions, ...userPermissions])];
  }

  async getEventAttendees(userId: number, eventId: number) {
    return this.eventAttendeeService.findEventAttendeeByUserId(eventId, userId);
  }

  async getEvent(slug: string) {
    // Make sure we load the group and user relations for permission checks
    const event = await this.eventQueryService.findEventBySlug(slug);

    // Ensure we have loaded the group and user relations for permission checks
    // These are used by the permissions guard
    if (event && !event.group) {
      try {
        // Load group relation separately if needed
        const eventWithRelations = await this.eventQueryService.showEvent(slug);
        if (eventWithRelations) {
          event.group = eventWithRelations.group;
          event.user = eventWithRelations.user;
        }
      } catch (error) {
        this.logger.error(`Error loading event relations for ${slug}:`, error);
      }
    }

    return event;
  }

  async getGroup(slug: string) {
    return this.groupService.findGroupBySlug(slug);
  }

  async getGroupMembers(
    userId: number,
    groupId: number,
  ): Promise<GroupMemberEntity[]> {
    return this.groupService.getGroupMembers(groupId);
  }

  /**
   * This method finds a specific group member by user ID for a group
   */
  async getGroupMemberByUserId(
    userId: number,
    groupId: number,
  ): Promise<GroupMemberEntity | null> {
    try {
      // Use the GroupService to find the group member
      // This will use the correct tenant context
      const groupMembers = await this.groupService.getGroupMembers(groupId);

      // Debug all group members to ensure we have data
      this.logger.debug(
        `[getGroupMemberByUserId] Found ${groupMembers.length} members in group ${groupId}`,
        {
          memberUserIds: groupMembers.map((m) => m.user?.id || 'no-user'),
          memberRoles: groupMembers.map((m) => m.groupRole?.name || 'no-role'),
        },
      );

      // Find the specific member for this user
      const groupMember = groupMembers.find(
        (member) => member.user && member.user.id === userId,
      );

      if (groupMember) {
        this.logger.debug(
          `[getGroupMemberByUserId] Found membership for user ${userId} in group ${groupId}`,
          {
            roleName: groupMember.groupRole?.name,
            hasPermissions: !!groupMember.groupRole?.groupPermissions,
            permissionsCount:
              groupMember.groupRole?.groupPermissions?.length || 0,
            permissions: groupMember.groupRole?.groupPermissions?.map(
              (p) => p.name,
            ),
          },
        );
      } else {
        this.logger.debug(
          `[getGroupMemberByUserId] No membership found for user ${userId} in group ${groupId}`,
        );
      }

      return groupMember || null;
    } catch (error) {
      this.logger.error(
        `Error getting group member for user ${userId} in group ${groupId}:`,
        error,
      );
      return null;
    }
  }

  async getGroupMemberPermissions(
    userId: number,
    groupId: number,
  ): Promise<any[]> {
    return this.groupService.getGroupMemberPermissions(userId, groupId);
  }

  async getAttendeePermissions(id: number): Promise<any[]> {
    return this.eventAttendeeService.getEventAttendeePermissions(id);
  }

  async getUserWithRolePermissions(userId: number) {
    return this.userService.findById(userId);
  }

  async getEventAttendeeBySlug(userId: number, eventSlug: string) {
    const event = await this.eventQueryService.findEventBySlug(eventSlug);
    if (!event) return null;

    const eventAttendee =
      await this.eventAttendeeService.findEventAttendeeByUserId(
        event.id,
        userId,
      );
    return eventAttendee;
  }

  async getGroupMembersBySlug(userId: number, groupSlug: string) {
    const group = await this.groupService.findGroupBySlug(groupSlug);
    if (!group) return null;

    return this.groupService.getGroupMembers(group.id);
  }

  async getGroupMemberByUserSlugAndGroupSlug(
    userSlug: string,
    groupSlug: string,
  ) {
    return this.groupMemberService.findGroupMemberByUserSlugAndGroupSlug(
      groupSlug,
      userSlug,
    );
  }

  async loginWithBluesky(handle: string) {
    const response = await fetch(
      `${process.env.APP_API_URL}/auth-bluesky/?handle=${handle}`,
    );
    const data = await response.json();
    return data.url;
  }

  async handleBlueskyCallback(params: URLSearchParams) {
    const response = await fetch(
      `${process.env.APP_API_URL}/auth-bluesky/callback?${params.toString()}`,
    );
    const data = await response.json();
    return data;
  }

  /**
   * Quick RSVP: Allow unregistered users to RSVP to events with just name + email
   * Creates user account, RSVP, and sends verification email
   * @param dto - Contains name, email, and eventSlug
   * @param tenantId - Tenant identifier
   * @returns Success message with verification code (for testing)
   */
  async quickRsvp(dto: QuickRsvpDto, tenantId: string) {
    const { name, eventSlug, status = EventAttendeeStatus.Confirmed } = dto;

    // Normalize email to lowercase for consistency
    const email = dto.email.toLowerCase().trim();

    // 1. Find the event
    const event = await this.eventQueryService.findEventBySlug(eventSlug);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // 2. Block events that explicitly require group membership (V1 limitation)
    if (event.group && event.requireGroupMembership) {
      throw new ForbiddenException(
        'This event requires group membership. Please register for a full account to join this event.',
      );
    }

    // 3. Validate event status and date
    if (event.status === 'cancelled') {
      throw new ForbiddenException('This event has been cancelled.');
    }

    if (event.status !== 'published') {
      throw new ForbiddenException(
        'This event is not published yet. Please check back later.',
      );
    }

    // Check if event has already passed (use end date to allow RSVPs during the event)
    // Fall back to startDate if endDate is not set
    const cutoffDate = event.endDate || event.startDate;
    if (cutoffDate && new Date(cutoffDate) < new Date()) {
      throw new ForbiddenException('This event has already passed.');
    }

    // 4. Parse name into firstName and lastName
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 4. Check if user already exists - Luma-style flow
    // If user exists (any type), they must sign in to RSVP
    let user: NullableType<User> = await this.userService.findByEmail(
      email,
      tenantId,
    );

    if (user) {
      // User exists - they need to sign in to complete RSVP
      // Frontend will redirect to /auth/signin, then auto-create RSVP after login
      throw new ConflictException(
        'An account with this email already exists. Please sign in to RSVP.',
      );
    }

    // 5. Create new user
    const defaultRole = await this.roleService.findByName(RoleEnum.User);
    if (!defaultRole) {
      throw new NotFoundException('Default role not found');
    }

    // Create user as INACTIVE (passwordless account)
    // User can verify later via:
    //   1. Passwordless login (request email code via /auth/request-login-code)
    //   2. Social login (automatic account merge if email matches)
    // No verification email sent at this time - frictionless Quick RSVP
    user = await this.userService.create(
      {
        email,
        firstName,
        lastName,
        provider: AuthProvidersEnum.email,
        socialId: null,
        role: defaultRole.id,
        status: { id: StatusEnum.inactive },
      },
      tenantId,
    );

    this.logger.log(`Created new INACTIVE user via quick RSVP: ${email}`);

    // 5. Ensure user was created successfully
    if (!user) {
      throw new NotFoundException('Failed to create user');
    }

    // 6. Create or find RSVP (idempotent)
    const existingRsvp = await this.eventAttendeeService.findOne({
      where: {
        event: { id: event.id },
        user: { id: user.id },
      },
    });

    if (!existingRsvp) {
      // Check event capacity before creating new RSVP (only for confirmed status)
      if (status === EventAttendeeStatus.Confirmed && event.maxAttendees) {
        const confirmedCount =
          await this.eventAttendeeService.showEventAttendeesCount(
            event.id,
            EventAttendeeStatus.Confirmed,
          );

        if (confirmedCount >= event.maxAttendees) {
          // Event is full - check if waitlist is supported
          // Note: Currently no waitlistEnabled field, so we reject
          throw new ForbiddenException(
            `This event is full (${event.maxAttendees} attendees). No waitlist available.`,
          );
        }
      }

      // Get the participant role for the event attendee
      const participantRole = await this.eventRoleService.findByName(
        EventAttendeeRole.Participant,
      );

      // Determine final status based on event settings
      let finalStatus = status; // From DTO: Confirmed or Cancelled

      // If user is trying to confirm attendance AND event requires approval,
      // set status to Pending instead of Confirmed
      if (status === EventAttendeeStatus.Confirmed && event.requireApproval) {
        finalStatus = EventAttendeeStatus.Pending;
        this.logger.log(
          `Event ${event.id} requires approval - setting RSVP status to Pending`,
        );
      }

      await this.eventAttendeeService.create({
        event,
        user: user as any, // User domain type to UserEntity - safe cast
        role: participantRole,
        status: finalStatus,
      });
      this.logger.log(
        `Created RSVP with status ${finalStatus} for user ${user.id} to event ${event.id}`,
      );
    } else {
      this.logger.log(
        `RSVP already exists for user ${user.id} to event ${event.id}`,
      );
    }

    // 7. Return success - calendar invite will be sent via CalendarInviteListener
    // which listens for the 'event.rsvp.added' event emitted by eventAttendeeService
    return {
      success: true,
      message:
        'RSVP registered successfully. Check your email for a calendar invite.',
    };
  }

  /**
   * Verify email code and log in user
   * @param dto - Contains the 6-digit verification code
   * @param tenantId - Tenant identifier
   * @returns Login response with JWT tokens
   */
  async verifyEmailCode(
    dto: VerifyEmailCodeDto,
    tenantId: string,
  ): Promise<LoginResponseDto> {
    const { code } = dto;

    // Use consistent error message to prevent information leakage
    const VERIFICATION_ERROR = {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      errors: {
        code: 'Invalid or expired verification code',
      },
    };

    // 1. Validate code
    const verificationData =
      await this.emailVerificationCodeService.validateCode(code, dto.email);

    if (!verificationData) {
      throw new UnprocessableEntityException(VERIFICATION_ERROR);
    }

    // 2. Get user
    let user = await this.userService.findById(verificationData.userId);
    if (!user || !user.role) {
      // Log for debugging but show same error to user
      this.logger.error(
        `Verification code valid but user not found: ${verificationData.userId}`,
      );
      throw new UnprocessableEntityException(VERIFICATION_ERROR);
    }

    // 3. If user is inactive, activate them (email verification complete)
    if (user.status?.id === StatusEnum.inactive) {
      await this.userService.update(user.id, {
        status: { id: StatusEnum.active },
      });
      // Reload user to get updated data with all fields
      user = await this.userService.findByEmail(dto.email);
      if (!user) {
        // Log for debugging but show same error to user
        this.logger.error(`User disappeared during activation: ${dto.email}`);
        throw new UnprocessableEntityException(VERIFICATION_ERROR);
      }
    }

    // 4. Auto-create AT Protocol identity for email users who don't have one
    await this.ensureAtprotoIdentity(
      user,
      AuthProvidersEnum.email,
      null,
      tenantId,
    );

    // 5. Create session and return tokens (same as regular login)
    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const secureId = crypto.randomUUID();

    const session = await this.sessionService.create(
      {
        user,
        hash,
        secureId,
      },
      tenantId,
    );

    const { token, refreshToken, tokenExpires } = await this.getTokensData({
      id: user.id,
      role: user.role,
      slug: user.slug,
      sessionId: session.secureId,
      hash,
      tenantId,
    });

    return {
      token,
      refreshToken,
      tokenExpires,
      user,
      sessionId: session.secureId, // ← CRITICAL: Required for OIDC cookie (Matrix login)
    };
  }

  /**
   * Request a login code for passwordless authentication
   * Sends a 6-digit code to the user's email
   * @param email - User's email address
   * @param tenantId - Tenant ID
   */
  async requestLoginCode(
    email: string,
    tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Find or create user
    const user: NullableType<User> = await this.userService.findByEmail(
      normalizedEmail,
      tenantId,
    );

    if (!user) {
      // Don't create new accounts via passwordless login
      // Users should use the registration page to create accounts
      this.logger.log(
        `Login code requested for non-existent user: ${normalizedEmail}`,
      );
      throw new NotFoundException(
        'No account found with this email. Please register first.',
      );
    }

    // Generate 6-digit verification code (for both active and inactive users)
    const code = await this.emailVerificationCodeService.generateCode(
      user.id,
      tenantId,
      normalizedEmail,
    );

    // Send login code email
    await this.mailService.sendLoginCode({
      to: normalizedEmail,
      data: {
        name: user.firstName || 'there',
        code,
      },
    });

    // Log whether this is for verification or passwordless login
    if (user.status?.id !== StatusEnum.active) {
      this.logger.log(
        `Verification code sent to inactive user: ${normalizedEmail}`,
      );
    } else {
      this.logger.log(`Login code sent to active user: ${normalizedEmail}`);
    }

    this.logger.log(
      `Login code sent to ${normalizedEmail} (user ${user.id}, tenant ${tenantId})`,
    );

    return {
      success: true,
      message: 'We sent a login code to your email.',
    };
  }

  /**
   * Ensure user has an AT Protocol identity.
   *
   * For Google/GitHub users: Creates a custodial PDS account on our PDS
   * For Bluesky users: Links their existing DID (non-custodial)
   *
   * This method is designed to be non-blocking - PDS failures don't prevent login.
   *
   * @param user - The user to create identity for
   * @param authProvider - The authentication provider used
   * @param socialData - Social login data (includes DID for Bluesky)
   * @param tenantId - Tenant identifier
   */
  private async ensureAtprotoIdentity(
    user: User,
    authProvider: string,
    socialData: SocialInterface | null,
    tenantId: string,
  ): Promise<void> {
    // Skip if user has no ulid (shouldn't happen, but be defensive)
    if (!user.ulid) {
      this.logger.warn(
        `User ${user.id} has no ulid - skipping AT Protocol identity creation`,
      );
      return;
    }

    try {
      // Check if user already has an AT Protocol identity
      const existingIdentity =
        await this.userAtprotoIdentityService.findByUserUlid(
          tenantId,
          user.ulid,
        );

      if (existingIdentity) {
        this.logger.debug(
          `User ${user.id} already has AT Protocol identity (DID: ${existingIdentity.did})`,
        );
        return;
      }

      // Different handling based on auth provider
      if (authProvider === AuthProvidersEnum.bluesky && socialData) {
        // Bluesky users: Link their existing DID (non-custodial)
        await this.linkBlueskyIdentity(user, socialData, tenantId);
      } else if (
        authProvider === AuthProvidersEnum.google ||
        authProvider === AuthProvidersEnum.github ||
        authProvider === AuthProvidersEnum.email
      ) {
        // Google/GitHub/Email users: Create custodial PDS account
        await this.createCustodialPdsAccount(user, tenantId);
      }
      // Other providers - skip AT Protocol identity creation for now
    } catch (error) {
      // Log error but don't fail login - AT identity is an enhancement, not required
      this.logger.warn(
        `Failed to create AT Protocol identity for user ${user.id}: ${error.message}`,
      );
    }
  }

  /**
   * Link an existing Bluesky DID to the user (non-custodial).
   *
   * Resolves the user's actual PDS URL from their DID document to support
   * users on any PDS (not just bsky.social).
   */
  private async linkBlueskyIdentity(
    user: User,
    socialData: SocialInterface,
    tenantId: string,
  ): Promise<void> {
    if (!socialData.id) {
      this.logger.warn(
        `Bluesky user ${user.id} has no DID in social data - skipping identity link`,
      );
      return;
    }

    // socialData.id is the DID for Bluesky users
    const did = socialData.id;

    // Resolve PDS URL and handle from DID document to support users on any PDS
    let pdsUrl: string | null = null;
    let handle: string | null = null;

    try {
      const profile = await this.blueskyIdentityService.resolveProfile(did);
      pdsUrl = profile.pdsUrl;
      handle = profile.handle !== did ? profile.handle : null;

      this.logger.debug(
        `Resolved Bluesky profile for ${did}: handle=${handle}, pdsUrl=${pdsUrl}`,
      );
    } catch (error) {
      this.logger.warn(
        `Could not resolve Bluesky profile for ${did}: ${error.message}`,
      );
      // Cannot link identity without PDS URL - it's required for valid AT Protocol identity
      return;
    }

    await this.userAtprotoIdentityService.create(tenantId, {
      userUlid: user.ulid,
      did,
      handle, // Resolved handle from their PDS
      pdsUrl, // Resolved from DID document
      pdsCredentials: null, // Non-custodial - no credentials
      isCustodial: false,
    });

    this.logger.log(
      `Linked Bluesky identity for user ${user.id}: ${did} (non-custodial, handle: ${handle || 'unresolved'})`,
    );
  }

  /**
   * Create a custodial PDS account for Google/GitHub users.
   *
   * Includes retry logic to handle race conditions where a handle becomes
   * unavailable between the availability check and account creation.
   */
  private async createCustodialPdsAccount(
    user: User,
    tenantId: string,
  ): Promise<void> {
    // Get PDS URL from config
    const pdsUrl = this.configService.get('pds.url', { infer: true });

    if (!pdsUrl) {
      this.logger.debug(
        `PDS_URL not configured - skipping custodial account creation for user ${user.id}`,
      );
      return;
    }

    const email = user.email || `${user.ulid}@openmeet.net`;
    const maxCreateAttempts = 5; // Retry a few times for race conditions

    // Validate user has a slug before proceeding
    if (!user.slug) {
      this.logger.warn(
        `User ${user.id} has no slug - skipping custodial PDS account creation`,
      );
      return;
    }

    for (
      let createAttempt = 0;
      createAttempt < maxCreateAttempts;
      createAttempt++
    ) {
      // Generate unique handle (checks availability)
      const handle = await this.generateUniqueHandle(user.slug);

      // Generate secure random password (new password each attempt for security)
      const password = crypto.randomBytes(32).toString('hex');

      try {
        // Create account on PDS
        const pdsResponse = await this.pdsAccountService.createAccount({
          email,
          handle,
          password,
        });

        // Encrypt password for storage
        const encryptedPassword = this.pdsCredentialService.encrypt(password);

        // Store the AT Protocol identity
        await this.userAtprotoIdentityService.create(tenantId, {
          userUlid: user.ulid,
          did: pdsResponse.did,
          handle: pdsResponse.handle,
          pdsUrl,
          pdsCredentials: encryptedPassword,
          isCustodial: true,
        });

        this.logger.log(
          `Created custodial PDS account for user ${user.id}: ${pdsResponse.did} (handle: ${pdsResponse.handle})`,
        );
        return; // Success - exit the retry loop
      } catch (error) {
        // Check if this is a "handle taken" error (race condition)
        // Be specific to avoid masking other 400 errors
        const isHandleTaken =
          error instanceof PdsApiError &&
          (error.atError === 'HandleNotAvailable' ||
            error.atError === 'HandleAlreadyExists' ||
            (error.message?.toLowerCase().includes('handle') &&
              (error.message?.toLowerCase().includes('taken') ||
                error.message?.toLowerCase().includes('available'))));

        if (isHandleTaken && createAttempt < maxCreateAttempts - 1) {
          this.logger.warn(
            `Handle ${handle} was taken between check and create (attempt ${createAttempt + 1}/${maxCreateAttempts}), retrying...`,
          );
          continue; // Retry with a new handle
        }

        // Check if this is an "email taken" error - user can recover via settings
        const isEmailTaken =
          error instanceof PdsApiError &&
          error.message?.toLowerCase().includes('email') &&
          (error.message?.toLowerCase().includes('taken') ||
            error.message?.toLowerCase().includes('already') ||
            error.message?.toLowerCase().includes('in use'));

        if (isEmailTaken) {
          this.logger.warn(
            `PDS account already exists for email - user can recover via settings`,
            { userId: user.id, email: user.email },
          );
          return; // Don't throw, login continues without AT Protocol identity
        }

        // Not a handle collision or email taken - re-throw
        throw error;
      }
    }

    // Should not reach here, but just in case
    throw new Error(
      `Failed to create PDS account after ${maxCreateAttempts} attempts`,
    );
  }

  /**
   * Generate a unique AT Protocol handle for a user.
   *
   * Tries the base slug first, then appends incrementing numbers if taken.
   * Truncates long slugs to fit PDS handle length limits (18 chars for first segment).
   *
   * @param baseSlug - The user's slug to base the handle on
   * @returns A unique handle
   * @throws Error if baseSlug is empty/invalid or no available handle found
   */
  private async generateUniqueHandle(baseSlug: string): Promise<string> {
    // Validate slug input
    if (!baseSlug || typeof baseSlug !== 'string') {
      throw new Error('Cannot generate handle: slug is required');
    }

    const trimmedSlug = baseSlug.trim();
    if (trimmedSlug.length === 0) {
      throw new Error('Cannot generate handle: slug cannot be empty');
    }

    const handleDomain =
      this.configService.get('pds.serviceHandleDomains', { infer: true }) ||
      '.opnmt.me';

    // PDS limits first segment (before domain) to 18 characters
    // Reserve 2 chars for collision suffix (supports up to 99 collisions)
    const maxFirstSegment = 18;
    const collisionSuffixReserve = 2;
    const maxSlugLength = maxFirstSegment - collisionSuffixReserve;

    // Truncate slug if too long, ensuring it doesn't end with a hyphen
    let truncatedSlug =
      trimmedSlug.length > maxSlugLength
        ? trimmedSlug.slice(0, maxSlugLength)
        : trimmedSlug;
    truncatedSlug = truncatedSlug.replace(/-+$/, ''); // Remove trailing hyphens

    // Final validation after truncation
    if (truncatedSlug.length === 0) {
      throw new Error(
        'Cannot generate handle: slug results in empty string after processing',
      );
    }

    let handle = `${truncatedSlug}${handleDomain}`;
    let attempt = 0;
    const maxAttempts = 99; // Safety limit - matches 2-char collision suffix reserve

    while (attempt < maxAttempts) {
      try {
        const isAvailable =
          await this.pdsAccountService.isHandleAvailable(handle);
        if (isAvailable) {
          return handle;
        }
      } catch (error) {
        // If handle check fails, throw to let outer handler deal with it
        throw error;
      }

      attempt++;
      handle = `${truncatedSlug}${attempt}${handleDomain}`;
    }

    // If we exhausted attempts, throw
    throw new Error(
      `Could not find available handle after ${maxAttempts} attempts`,
    );
  }
}
