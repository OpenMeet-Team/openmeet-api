import {
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
  Scope,
  Inject,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { NullableType } from '../utils/types/nullable.type';
import { FilterUserDto, SortUserDto } from './dto/query-user.dto';
import bcrypt from 'bcryptjs';
import { RoleEnum } from '../role/role.enum';
import { getStatusEnumValue, StatusEnum } from '../status/status.enum';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { User } from './domain/user';
import { Repository } from 'typeorm';
import { UserEntity } from './infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { UserPermissionEntity } from './infrastructure/persistence/relational/entities/user-permission.entity';
import { RoleService } from '../role/role.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { AuditLoggerService } from '../logger/audit-logger.provider';
import { SocialInterface } from '../social/interfaces/social.interface';
import { StatusDto } from '../status/dto/status.dto';
import { GlobalMatrixValidationService } from '../matrix/services/global-matrix-validation.service';
import { BlueskyIdentityService } from '../bluesky/bluesky-identity.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class UserService {
  private readonly auditLogger = AuditLoggerService.getInstance();
  private readonly logger = new Logger(UserService.name);

  private usersRepository: Repository<UserEntity>;
  private userPermissionRepository: Repository<UserPermissionEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly subCategoryService: SubCategoryService,
    private readonly roleService: RoleService,
    private eventEmitter: EventEmitter2,
    private readonly fileService: FilesS3PresignedService,
    private readonly globalMatrixValidationService: GlobalMatrixValidationService,
    private readonly blueskyIdentityService: BlueskyIdentityService,
  ) {}

  async getTenantSpecificRepository(tenantId?: string) {
    const effectiveTenantId = tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      this.logger.error('getTenantSpecificRepository: Tenant ID is required', {
        effectiveTenantId,
      });
      throw new Error('Tenant ID is required');
    }
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    this.usersRepository = dataSource.getRepository(UserEntity);
    this.userPermissionRepository =
      dataSource.getRepository(UserPermissionEntity);
  }

  async getUserPermissions(userId: number): Promise<UserPermissionEntity[]> {
    await this.getTenantSpecificRepository();
    const userPermissions = await this.userPermissionRepository.find({
      where: { user: { id: userId } },
      relations: ['permission'],
    });

    return userPermissions;
  }

  async create(
    createProfileDto: CreateUserDto,
    tenantId?: string,
  ): Promise<User> {
    const effectiveTenantId = tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
    await this.getTenantSpecificRepository(effectiveTenantId);

    let subCategoriesEntities: any = [];
    const subCategoriesIds = createProfileDto.subCategories;
    if (subCategoriesIds && subCategoriesIds.length > 0) {
      subCategoriesEntities = await Promise.all(
        subCategoriesIds.map(async (subCategoriesId) => {
          const subCategory =
            await this.subCategoryService.findOne(subCategoriesId);
          if (!subCategory) {
            throw new NotFoundException(
              `SubCategory with ID ${subCategoriesId} not found`,
            );
          }
          return subCategory;
        }),
      );
    }

    const role = await this.roleService.findByName(RoleEnum.User, tenantId);
    if (!role) {
      throw new Error(`Role not found: ${RoleEnum.User}`);
    }

    const clonedPayload = {
      ...createProfileDto,
      role,
      subCategory: subCategoriesEntities,
    };
    if (clonedPayload.password) {
      const salt = await bcrypt.genSalt();
      clonedPayload.password = await bcrypt.hash(clonedPayload.password, salt);
    }

    if (clonedPayload.email) {
      const userObject = await this.usersRepository.findOne({
        where: { email: clonedPayload.email },
        select: ['id', 'email'],
      });
      if (userObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'emailAlreadyExists',
          },
        });
      }
    }

    if (clonedPayload.photo?.id) {
      const fileObject = await this.fileService.findById(
        clonedPayload.photo.id,
      );
      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }
      clonedPayload.photo = fileObject;
    }

    if (clonedPayload.status?.id) {
      const statusObject = Object.values(StatusEnum)
        .map(String)
        .includes(String(clonedPayload.status.id));
      if (!statusObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            status: 'statusNotExists',
          },
        });
      }
    }
    this.logger.debug('create: clonedPayload', {
      clonedPayload,
    });
    const userCreated = await this.usersRepository.save(
      this.usersRepository.create(clonedPayload),
    );
    this.eventEmitter.emit('user.created', userCreated);

    this.auditLogger.log('user created', {
      userCreated,
    });
    return userCreated;
  }

  async findAll(): Promise<User[]> {
    await this.getTenantSpecificRepository();
    return await this.usersRepository.find();
  }

  async findManyWithPagination({
    filterOptions,
    sortOptions,
    paginationOptions,
  }: {
    filterOptions?: FilterUserDto | null;
    sortOptions?: SortUserDto[] | null;
    paginationOptions: IPaginationOptions;
  }): Promise<User[]> {
    this.logger.debug(
      'TODO: this keeps ci from passing ',
      filterOptions,
      sortOptions,
      paginationOptions,
    );
    await this.getTenantSpecificRepository();

    return [];
  }

  async showProfile(slug: User['slug']): Promise<NullableType<User>> {
    await this.getTenantSpecificRepository();

    const user = await this.usersRepository.findOne({
      where: {
        slug,
      },
      relations: {
        photo: true,
        interests: true,
        groups: true,
        groupMembers: {
          group: true,
          groupRole: true,
        },
      },
    });

    if (!user) {
      return null;
    }

    // Load events with visibility filtering
    // Only show public events on user profiles
    const eventsQuery = this.usersRepository.manager
      .createQueryBuilder(EventEntity, 'event')
      .where('event.userId = :userId', { userId: user.id })
      .andWhere('event.visibility = :visibility', { visibility: 'public' })
      .andWhere('event.status IN (:...statuses)', {
        statuses: ['published', 'cancelled'],
      });

    const publicEvents = await eventsQuery.getMany();
    user['events'] = publicEvents;

    // Resolve and update Bluesky handle from DID (for any Bluesky user)
    if (user?.preferences?.bluesky?.did) {
      try {
        const profile = await this.blueskyIdentityService.resolveProfile(
          user.preferences.bluesky.did,
        );
        this.logger.debug(
          `Resolved Bluesky profile for ${user.preferences.bluesky.did}: handle=${profile.handle}, did=${profile.did}`,
        );
        // Replace stored handle with current resolved handle, fallback to DID if empty
        user.preferences.bluesky.handle =
          profile.handle || user.preferences.bluesky.did;
        this.logger.debug(
          `Set user.preferences.bluesky.handle to: ${user.preferences.bluesky.handle}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch full Bluesky profile for DID ${user.preferences.bluesky.did}: ${error.message}`,
        );
        // Fallback: Extract handle directly from DID document (lightweight, always works)
        try {
          user.preferences.bluesky.handle =
            await this.blueskyIdentityService.extractHandleFromDid(
              user.preferences.bluesky.did,
            );
          this.logger.debug(
            `Extracted handle from DID document: ${user.preferences.bluesky.handle}`,
          );
        } catch {
          this.logger.warn(
            `Failed to extract handle from DID document, using DID as fallback`,
          );
          user.preferences.bluesky.handle = user.preferences.bluesky.did;
        }
      }
    }

    // Keep existing socialProfiles and profileEndpoints code for backward compatibility
    if (user && user.preferences?.bluesky) {
      const { bluesky } = user.preferences;

      // Add formatted ATProtocol profile data for easier consumption by the frontend
      user['socialProfiles'] = {
        ...user['socialProfiles'], // Preserve any existing social profiles
        atprotocol: {
          did: bluesky.did,
          handle: bluesky.handle, // Now using resolved handle from above
          avatarUrl: bluesky.avatar,
          connected: bluesky.connected === true,
          connectedAt: bluesky.connectedAt,
        },
      };

      // Add an endpoint for getting detailed profile info
      if (bluesky.did || bluesky.handle) {
        user['profileEndpoints'] = {
          ...user['profileEndpoints'],
          atprotocol: `/api/bluesky/user-profile/${user.slug}`,
        };
      }
    }

    return user;
  }

  async findById(
    id: User['id'],
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    await this.getTenantSpecificRepository(tenantId);

    return this.usersRepository.findOne({
      where: { id },
      relations: ['role', 'role.permissions', 'interests'],
    });
  }

  async findByIdWithPreferences(
    id: User['id'],
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    await this.getTenantSpecificRepository(tenantId);

    return this.usersRepository.findOne({
      where: { id },
      relations: ['role', 'role.permissions'],
      select: ['id', 'socialId', 'preferences'],
    });
  }

  async findOne(id: User['id']): Promise<NullableType<UserEntity>> {
    await this.getTenantSpecificRepository();

    return this.usersRepository.findOne({
      where: { id: Number(id) },
      relations: ['role'],
    });
  }

  async findByUlid(ulid: User['ulid']): Promise<NullableType<UserEntity>> {
    await this.getTenantSpecificRepository();

    return this.usersRepository.findOne({
      where: { ulid },
    });
  }

  async findByEmail(
    email: User['email'],
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    if (!email) return null;

    await this.getTenantSpecificRepository(tenantId);
    return this.usersRepository.findOne({
      where: { email },
      relations: ['role', 'role.permissions'],
      select: [
        'id',
        'slug',
        'ulid',
        'email',
        'password',
        'provider',
        'socialId',
        'firstName',
        'lastName',
        'createdAt',
        'updatedAt',
        'deletedAt',
        'bio',
        'isShadowAccount',
        'preferences',
      ],
    });
  }

  async findBySocialIdAndProvider(
    {
      socialId,
      provider,
    }: {
      socialId: User['socialId'];
      provider: User['provider'];
    },
    tenantId?: string,
  ): Promise<NullableType<User>> {
    this.logger.debug('findBySocialIdAndProvider', {
      socialId,
      provider,
      tenantId,
    });
    if (!socialId || !provider) return null;

    await this.getTenantSpecificRepository(tenantId);

    const user = await this.usersRepository.findOne({
      where: { socialId, provider },
      relations: ['role', 'role.permissions'],
    });
    this.logger.debug('findBySocialIdAndProvider result', {
      user,
    });
    return user;
  }

  /**
   * Finds or creates a user for social authentication providers
   *
   * NOTE ABOUT BLUESKY IDs:
   * - When authProvider='bluesky', the profile.id is the user's DID
   * - This DID is stored directly in the user.socialId field
   * - We use this socialId field for Bluesky operations rather than duplicating in preferences
   * - When working with Bluesky, check for user.provider === 'bluesky' && user.socialId
   */
  async findOrCreateUser(
    profile: SocialInterface,
    authProvider: string,
    tenantId: string,
  ): Promise<UserEntity> {
    this.logger.debug(
      `Finding or creating user for provider: ${authProvider}, tenantId: ${tenantId}`,
    );

    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    await this.getTenantSpecificRepository(tenantId);

    // Attempt to find the user by socialId and provider
    const existingUser = await this.findBySocialIdAndProvider(
      {
        socialId: profile.id,
        provider: authProvider,
      },
      tenantId,
    );

    if (existingUser) {
      this.logger.debug('findOrCreateUser: found existing user', {
        existingUser,
      });

      // If the existing user has an email but the profile doesn't, update the profile
      if (existingUser.email && !profile.email) {
        this.logger.debug('Using existing email from database for user', {
          userId: existingUser.id,
          email: existingUser.email,
        });
        profile.email = existingUser.email;
      }

      return existingUser as UserEntity;
    }

    // If user doesn't exist, create a new one
    const roleEntity = await this.roleService.findByName(
      RoleEnum.User,
      tenantId,
    );
    if (!roleEntity) {
      throw new NotFoundException('Role not found');
    }

    const statusDto = new StatusDto();
    statusDto.id = getStatusEnumValue('active');

    // Create new user with Bluesky preferences if applicable
    const createUserData: any = {
      socialId: profile.id,
      provider: authProvider,
      email: profile.email || null,
      firstName: profile.firstName || null,
      lastName: profile.lastName || null,
      role: roleEntity.id,
      status: statusDto,
    };

    // Set Bluesky preferences if user is logging in via Bluesky
    if (authProvider === 'bluesky') {
      createUserData.preferences = {
        bluesky: {
          did: profile.id,
          // Note: We don't store the handle here - it's resolved from DID when needed
          connected: true,
          autoPost: false,
          connectedAt: new Date(),
        },
      };
    }

    try {
      const newUser = (await this.create(
        createUserData,
        tenantId,
      )) as unknown as UserEntity;

      this.logger.debug('findOrCreateUser: created user', {
        newUser,
      });
      return newUser;
    } catch (error) {
      // Check if this is an email already exists error
      if (error instanceof UnprocessableEntityException) {
        const errorData = error.getResponse() as any;
        if (errorData?.errors?.email === 'emailAlreadyExists') {
          // Find the existing user to determine what auth method they used
          const existingUser = await this.findByEmail(
            profile.email || null,
            tenantId,
          );

          let authMethod = 'email/password';
          if (existingUser?.provider) {
            authMethod = existingUser.provider;
          }

          throw new UnprocessableEntityException({
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            errors: {
              email: `An account with this email already exists. Please sign in using your ${authMethod} account instead.`,
            },
          });
        }
      }
      // Re-throw any other errors
      throw error;
    }
  }

  async update(
    id: User['id'],
    payload: any,
    tenantId?: string,
  ): Promise<User | null> {
    this.logger.debug(`Updating user with ID: ${id}, tenantId: ${tenantId}`);
    await this.getTenantSpecificRepository(tenantId);

    const clonedPayload = { ...payload };

    if (
      clonedPayload.password &&
      clonedPayload.previousPassword !== clonedPayload.password
    ) {
      const salt = await bcrypt.genSalt();
      clonedPayload.password = await bcrypt.hash(clonedPayload.password, salt);
    }

    if (clonedPayload.email) {
      const userObject = await this.findByEmail(clonedPayload.email, tenantId);

      if (userObject && userObject.id !== id) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            email: 'emailAlreadyExists',
          },
        });
      }
    }

    if (clonedPayload.interests) {
      clonedPayload.interests = await this.subCategoryService.findMany(
        clonedPayload.interests.map((interest) => interest.id),
      );
    } else {
      clonedPayload.interests = [];
    }

    if (clonedPayload.photo?.id === 0) {
      if (clonedPayload.photo) {
        await this.fileService.delete(clonedPayload.photo.id);
        clonedPayload.photo = null;
      }
    } else if (clonedPayload.photo?.id) {
      const fileObject = await this.fileService.findById(
        clonedPayload.photo.id,
      );

      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }

      clonedPayload.photo = fileObject;
    }

    if (clonedPayload.role?.id) {
      const role = await this.roleService.findByName(RoleEnum.User, tenantId);
      if (!role) {
        throw new Error(`Role not found: ${RoleEnum.User}`);
      }
      clonedPayload.role = role;
    }

    // if (clonedPayload.role?.id) {
    //   const roleObject = Object.values(RoleEnum)
    //     .map(String)
    //     .includes(String(clonedPayload.role.id));
    //   if (!roleObject) {
    //     throw new UnprocessableEntityException({
    //       status: HttpStatus.UNPROCESSABLE_ENTITY,
    //       errors: {
    //         role: 'roleNotExists',
    //       },
    //     });
    //   }
    // }

    if (clonedPayload.status?.id) {
      const statusObject = Object.values(StatusEnum)
        .map(String)
        .includes(String(clonedPayload.status.id));
      if (!statusObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            status: 'statusNotExists',
          },
        });
      }
    }

    // Find the existing user first to preserve required fields like slug
    const existingUser = await this.usersRepository.findOne({ where: { id } });
    if (!existingUser) {
      throw new Error(`User with ID ${id} not found`);
    }

    // Use Object.assign to merge existing user with updates, following event service pattern
    const userToSave = Object.assign(existingUser, clonedPayload);
    await this.usersRepository.save(userToSave);

    const user = await this.findById(id, tenantId);
    this.eventEmitter.emit('user.updated', user);
    this.auditLogger.log('user updated', {
      user,
    });
    return user;
  }

  async remove(id: User['id']): Promise<void> {
    // Ensure ID is a number (it might come as a string from the controller)
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;

    // Get tenant ID for Matrix cleanup
    const tenantId = this.request.tenantId;

    // Set up tenant-specific repository
    await this.getTenantSpecificRepository();

    // Clean up Matrix handle registry before soft deleting user
    if (tenantId) {
      try {
        await this.globalMatrixValidationService.unregisterMatrixHandle(
          tenantId,
          numericId,
        );
        this.logger.log(
          `Matrix handle unregistered for user ${numericId} in tenant ${tenantId}`,
        );
      } catch (error) {
        // Log error but don't fail user deletion if Matrix cleanup fails
        this.logger.warn(
          `Failed to unregister Matrix handle for user ${numericId} in tenant ${tenantId}: ${error.message}`,
          error.stack,
        );
      }
    }

    await this.usersRepository.softDelete(numericId);
    this.auditLogger.log('user deleted', {
      id: numericId,
    });
  }

  async getMailServiceUserById(id: number): Promise<UserEntity> {
    this.logger.debug('getMailServiceUserById', {
      id,
    });
    await this.getTenantSpecificRepository();
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['photo'],
      select: {
        firstName: true,
        lastName: true,
        name: true,
        email: true,
        photo: {
          path: true,
        },
      },
    });
    this.logger.debug('getMailServiceUserById result', {
      user,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getUserBySlug(slug: User['slug']): Promise<NullableType<UserEntity>> {
    await this.getTenantSpecificRepository();
    const user = await this.usersRepository.findOne({ where: { slug } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Alias for getUserBySlug to support the MatrixService refactoring
   * Maintains compatibility with the MatrixUserService interface
   */
  async findBySlug(
    slug: User['slug'],
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    if (tenantId) {
      return this.getUserBySlugWithTenant(slug, tenantId);
    }
    return this.getUserBySlug(slug);
  }

  /**
   * Tenant-aware version of getUserBySlug that doesn't rely on the request context
   * This is useful for background processing where the request context is not available
   */
  async getUserBySlugWithTenant(
    slug: User['slug'],
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    // If tenantId is not provided, try to use the one from the request
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    this.logger.debug('getUserBySlugWithTenant', {
      slug,
      tenantId: effectiveTenantId,
    });

    // Get a connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    const userRepo = dataSource.getRepository(UserEntity);

    // Find the user using the provided tenant connection
    const user = await userRepo.findOne({ where: { slug } });

    if (!user) {
      this.logger.warn(
        `User with slug ${slug} not found in tenant ${effectiveTenantId}`,
      );
      return null;
    }

    this.logger.debug('getUserBySlugWithTenant result', {
      user,
    });

    return user;
  }

  /**
   * @deprecated
   * Prefer getUserBySlug
   */
  async getUserById(id: number, tenantId?: string): Promise<UserEntity> {
    await this.getTenantSpecificRepository(tenantId);
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Find a user by their Matrix handle (registry-first approach)
   */
  async findByMatrixHandle(
    handle: string,
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    if (!handle) return null;

    const effectiveTenantId = tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      this.logger.warn('No tenant ID available for Matrix handle lookup');
      return null;
    }

    try {
      // Use the new registry method to find user by handle
      const registryEntry =
        await this.globalMatrixValidationService.getUserByMatrixHandle(
          handle,
          effectiveTenantId,
        );

      if (!registryEntry) {
        return null;
      }

      // Get the user from the database using the userId from registry
      await this.getTenantSpecificRepository(tenantId);
      return this.usersRepository.findOne({
        where: { id: registryEntry.userId },
        select: ['id', 'firstName', 'lastName', 'email', 'slug'],
      });
    } catch (error) {
      this.logger.warn(
        `Error finding user by Matrix handle ${handle}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Find a user by their Matrix user ID (legacy method with registry fallback)
   */
  async findByMatrixUserId(
    matrixUserId: string,
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    if (!matrixUserId) return null;

    // Extract handle from Matrix user ID (format: @handle:server)
    const handleMatch = matrixUserId.match(/^@([^:]+):/);
    if (handleMatch) {
      const handle = handleMatch[1];

      // Try the new registry-based approach first
      const userFromRegistry = await this.findByMatrixHandle(handle, tenantId);
      if (userFromRegistry) {
        return userFromRegistry;
      }
    }

    // Fallback to legacy database lookup (only works if migration hasn't run yet)
    await this.getTenantSpecificRepository(tenantId);

    try {
      // Check if matrixUserId column still exists (before cleanup migration)
      const hasLegacyColumn = await this.checkIfMatrixUserIdColumnExists();
      if (hasLegacyColumn) {
        return this.usersRepository.findOne({
          where: { matrixUserId },
          select: ['id', 'firstName', 'lastName', 'email', 'slug'],
        });
      }
    } catch (error) {
      this.logger.warn(
        `Error finding user by Matrix ID ${matrixUserId}: ${error.message}`,
        error.stack,
      );
    }

    return null;
  }

  /**
   * Check if the legacy matrixUserId column still exists
   */
  private async checkIfMatrixUserIdColumnExists(): Promise<boolean> {
    try {
      const schema = this.request?.tenantId
        ? `tenant_${this.request.tenantId}`
        : 'public';
      const result = await this.usersRepository.query(
        `
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = $1 
          AND table_name = 'users' 
          AND column_name = 'matrixUserId'
        );
      `,
        [schema],
      );

      return result[0]?.exists || false;
    } catch (error) {
      this.logger.warn(
        `Error checking for matrixUserId column: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Find user by external ID (such as Bluesky DID)
   * @param externalId The external ID to search for (e.g., Bluesky DID)
   * @param tenantId The tenant ID
   * @returns The user entity or null if not found
   */
  async findByExternalId(
    externalId: string,
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    if (!externalId) return null;

    await this.getTenantSpecificRepository(tenantId);

    return this.usersRepository.findOne({
      where: { socialId: externalId },
      relations: ['role', 'role.permissions'],
    });
  }
}
