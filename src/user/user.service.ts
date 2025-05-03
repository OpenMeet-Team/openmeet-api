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
import { SubCategoryService } from '../sub-category/sub-category.service';
import { UserPermissionEntity } from './infrastructure/persistence/relational/entities/user-permission.entity';
import { RoleService } from '../role/role.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { AuditLoggerService } from '../logger/audit-logger.provider';
import { SocialInterface } from '../social/interfaces/social.interface';
import { StatusDto } from '../status/dto/status.dto';

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
      const userObject = await this.usersRepository.findOneBy({
        email: clonedPayload.email,
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
        events: true,
        groupMembers: {
          group: true,
          groupRole: true,
        },
      },
    });

    // Transform the user object to include formatted Bluesky profile information
    if (user && user.preferences?.bluesky) {
      const { bluesky } = user.preferences;

      // Add formatted ATProtocol profile data for easier consumption by the frontend
      user['socialProfiles'] = {
        ...user['socialProfiles'], // Preserve any existing social profiles
        atprotocol: {
          did: bluesky.did,
          handle: bluesky.handle,
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
          handle: profile.firstName,
          connected: true,
          autoPost: false,
          connectedAt: new Date(),
        },
      };
    }

    const newUser = (await this.create(
      createUserData,
      tenantId,
    )) as unknown as UserEntity;

    this.logger.debug('findOrCreateUser: created user', {
      newUser,
    });
    return newUser;
  }

  // Method removed as part of Zulip removal
  // This method is no longer needed as we've migrated to Matrix

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
      const role = await this.roleService.findByName(RoleEnum.User);
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

    await this.usersRepository.save({ id, ...clonedPayload }); // FIXME:

    const user = await this.findById(id, tenantId);
    this.eventEmitter.emit('user.updated', user);
    this.auditLogger.log('user updated', {
      user,
    });
    return user;
  }

  async remove(id: User['id']): Promise<void> {
    await this.usersRepository.softDelete(id);
    this.auditLogger.log('user deleted', {
      id,
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
   * Find a user by their Matrix user ID
   */
  async findByMatrixUserId(
    matrixUserId: string,
    tenantId?: string,
  ): Promise<NullableType<UserEntity>> {
    if (!matrixUserId) return null;

    await this.getTenantSpecificRepository(tenantId);

    try {
      return this.usersRepository.findOne({
        where: { matrixUserId },
        select: ['id', 'firstName', 'lastName', 'email', 'matrixUserId'],
      });
    } catch (error) {
      this.logger.warn(
        `Error finding user by Matrix ID ${matrixUserId}: ${error.message}`,
        error.stack,
      );
      return null;
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
