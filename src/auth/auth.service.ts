import {
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  Logger,
  Inject,
} from '@nestjs/common';
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

    // Automatically claim shadow account if one exists for Bluesky users
    if (
      authProvider === AuthProvidersEnum.bluesky &&
      socialData.id &&
      !user.isShadowAccount
    ) {
      try {
        const claimedUser = await this.shadowAccountService.claimShadowAccount(
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
    const user = await this.userService.create({
      ...dto,
      email: dto.email,
      role: role.id,
      status: {
        id: StatusEnum.active, // TODO implement tenant config check for tenant.confirmEmail
      },
    });

    const hash = await this.jwtService.signAsync(
      {
        confirmEmailUserId: user.id,
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

    const sessionHash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const secureId = crypto.randomUUID();

    const session = await this.sessionService.create({
      user,
      hash: sessionHash,
      secureId,
    });

    const { token, refreshToken, tokenExpires } = await this.getTokensData({
      id: user.id,
      role: user.role,
      slug: user.slug,
      sessionId: session.secureId,
      hash,
      tenantId,
    });

    const createdUser = await this.userService.findById(user.id);

    this.mailService
      .userSignUp({
        to: dto.email,
        data: {
          hash,
        },
      })
      .catch((err) => {
        this.logger.error('Error in login process:', err);
      });

    return {
      refreshToken,
      token,
      tokenExpires,
      user: createdUser,
      sessionId: session.secureId,
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

    await this.sessionService.deleteByUserId({
      userId: user.id,
    });

    await this.userService.update(user.id, user);
  }

  async me(userJwtPayload: JwtPayloadType): Promise<NullableType<User>> {
    try {
      return await this.userService.findById(userJwtPayload.id);
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
      if (!userDto.oldPassword) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            oldPassword: 'missingOldPassword',
          },
        });
      }

      if (!currentUser.password) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            oldPassword: 'Incorrect current password',
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
      } else {
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
    const {
      name,
      email,
      eventSlug,
      status = EventAttendeeStatus.Confirmed,
    } = dto;

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

    // 3. Parse name into firstName and lastName
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // 4. Find or create user (email already normalized by DTO transformer)
    let user: NullableType<User> = await this.userService.findByEmail(email);

    if (!user) {
      // Create new user
      const defaultRole = await this.roleService.findByName(RoleEnum.User);
      if (!defaultRole) {
        throw new NotFoundException('Default role not found');
      }

      user = await this.userService.create({
        email,
        firstName,
        lastName,
        provider: AuthProvidersEnum.email,
        socialId: null,
        role: defaultRole.id,
        status: { id: StatusEnum.active },
      });

      this.logger.log(`Created new user via quick RSVP: ${email}`);
    }

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
      // Get the participant role for the event attendee
      const participantRole = await this.eventRoleService.findByName(
        EventAttendeeRole.Participant,
      );

      await this.eventAttendeeService.create({
        event,
        user: user as any, // User domain type to UserEntity - safe cast
        role: participantRole,
        status, // Use status from DTO (Confirmed or Cancelled)
      });
      this.logger.log(
        `Created RSVP with status ${status} for user ${user.id} to event ${event.id}`,
      );
    } else {
      this.logger.log(
        `RSVP already exists for user ${user.id} to event ${event.id}`,
      );
    }

    // 7. Generate email verification code
    const verificationCode =
      await this.emailVerificationCodeService.generateCode(
        user.id,
        tenantId,
        email,
      );

    // 8. Send verification email
    await this.mailService.sendEmailVerification({
      to: email,
      data: {
        name: firstName,
        code: verificationCode,
        eventName: event.name,
      },
    });

    // 9. Return success (include code only in development/test environments)
    const response: {
      success: boolean;
      message: string;
      verificationCode?: string;
    } = {
      success: true,
      message: 'Please check your email for verification code',
    };

    // Only include verification code in non-production environments for testing
    if (process.env.NODE_ENV !== 'production') {
      response.verificationCode = verificationCode;
    }

    return response;
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

    // 1. Validate code
    const verificationData =
      await this.emailVerificationCodeService.validateCode(code, dto.email);

    if (!verificationData) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    // 2. Get user
    const user = await this.userService.findById(verificationData.userId);
    if (!user || !user.role) {
      throw new UnauthorizedException('User not found');
    }

    // 3. Create session and return tokens (same as regular login)
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
    };
  }
}
