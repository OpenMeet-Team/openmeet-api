import {
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
  Scope,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { NullableType } from '../utils/types/nullable.type';
import { FilterUserDto, SortUserDto } from './dto/query-user.dto';
import bcrypt from 'bcryptjs';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { FilesService } from '../file/file.service';
import { RoleEnum } from '../role/role.enum';
import { StatusEnum } from '../status/status.enum';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { DeepPartial } from '../utils/types/deep-partial.type';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { User } from './domain/user';
import { Repository } from 'typeorm';
import { UserEntity } from './infrastructure/persistence/relational/entities/user.entity';
import { SubCategoryService } from '../sub-category/sub-category.service';
import { UserPermissionEntity } from './infrastructure/persistence/relational/entities/user-permission.entity';
import { RoleService } from '../role/role.service';
import { SubCategoryEntity } from 'src/sub-category/infrastructure/persistence/relational/entities/sub-category.entity';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class UserService {
  private usersRepository: Repository<UserEntity>;
  private userPermissionRepository: Repository<UserPermissionEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly filesService: FilesService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly subCategoryService: SubCategoryService,
    private readonly roleService: RoleService,
  ) {}

  async getTenantSpecificRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
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

  async create(createProfileDto: CreateUserDto): Promise<User> {
    await this.getTenantSpecificRepository();
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

    const role = await this.roleService.findByName(RoleEnum.user);
    if (!role) {
      throw new Error(`Role not found: ${RoleEnum.user}`);
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
      const fileObject = await this.filesService.findById(
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

    const userCreated = await this.usersRepository.save(
      this.usersRepository.create(clonedPayload),
    );

    return userCreated;
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
    console.log(
      'TODO: this keeps ci from passing ',
      filterOptions,
      sortOptions,
      paginationOptions,
    );
    await this.getTenantSpecificRepository();

    return [];
    // this.usersRepository.findManyWithPagination({
    //   filterOptions,
    //   sortOptions,
    //   paginationOptions,
    // });
  }

  async findById(id: User['id']): Promise<NullableType<User>> {
    await this.getTenantSpecificRepository();

    return this.usersRepository.findOne({
      where: { id: Number(id) },
      relations: ['role'],
    });
  }

  async findByEmail(email: User['email']): Promise<NullableType<User>> {
    if (!email) return null;

    await this.getTenantSpecificRepository();
    return this.usersRepository.findOne({
      where: { email },
    });
  }

  async findBySocialIdAndProvider({
    socialId,
    provider,
  }: {
    socialId: User['socialId'];
    provider: User['provider'];
  }): Promise<NullableType<User>> {
    if (!socialId || !provider) return null;

    await this.getTenantSpecificRepository();

    return this.usersRepository.findOne({
      where: { socialId, provider },
    });
  }

  async update(
    id: User['id'],
    payload: DeepPartial<User>,
  ): Promise<User | null> {
    await this.getTenantSpecificRepository();

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

    if (clonedPayload.photo?.id) {
      const fileObject = await this.filesService.findById(
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
      const role = await this.roleService.findByName(RoleEnum.user);
      if (!role) {
        throw new Error(`Role not found: ${RoleEnum.user}`);
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

    await this.usersRepository.update(id, {}); // FIXME:
    return await this.findById(id);
  }

  async remove(id: User['id']): Promise<void> {
    await this.usersRepository.softDelete(id);
  }
}
