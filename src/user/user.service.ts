import {
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
  Scope,
  Inject,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { NullableType } from '../utils/types/nullable.type';
import { FilterUserDto, SortUserDto } from './dto/query-user.dto';
import bcrypt from 'bcryptjs';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { RoleEnum } from '../role/role.enum';
import { StatusEnum } from '../status/status.enum';
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
  ) {
    this.logger.log('UserService constructed');
  }

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
      provider: AuthProvidersEnum.email,
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
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        bio: true,
        photo: {
          path: true,
        },
        interests: {
          id: true,
          title: true,
        },
        groups: {
          id: true,
          name: true,
          slug: true,
          image: {
            path: true,
          },
        },
        events: {
          id: true,
          name: true,
          slug: true,
          image: {
            path: true,
          },
        },
        groupMembers: {
          id: true,
          group: {
            id: true,
            name: true,
            slug: true,
            image: {
              path: true,
            },
          },
          groupRole: {
            id: true,
            name: true,
          },
        },
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

    // const user = await this.usersRepository.findOne({
    //   where: { slug },
    //   relations: [
    //     'subCategory',
    //     'groups',
    //     'events',
    //     'groupMembers.group',
    //     'groupMembers.groupRole',
    //     'photo',
    //   ],
    // });

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
    });
    this.logger.debug('findBySocialIdAndProvider result', {
      user,
    });
    return user;
  }

  async addZulipCredentialsToUser(
    userId: number,
    {
      zulipUsername,
      zulipApiKey,
      zulipUserId,
    }: {
      zulipUsername: string;
      zulipApiKey: string;
      zulipUserId: number;
    },
  ) {
    await this.getTenantSpecificRepository();
    const user = await this.findById(userId);

    if (!user) {
      return null;
    }

    user.zulipUserId = zulipUserId;
    user.zulipApiKey = zulipApiKey;
    user.zulipUsername = zulipUsername;
    return this.usersRepository.save(user as UserEntity);
  }

  async update(
    id: User['id'],
    payload: any,
    tenantId?: string,
  ): Promise<User | null> {
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
      const userObject = await this.findByEmail(clonedPayload.email);

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

    const user = await this.findById(id);
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
    this.logger.debug('getUserBySlug', {
      slug,
    });
    const user = await this.usersRepository.findOne({ where: { slug } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    this.logger.debug('getUserBySlug result', {
      user,
    });
    return user;
  }

  async getUserById(id: number): Promise<UserEntity> {
    await this.getTenantSpecificRepository();
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
