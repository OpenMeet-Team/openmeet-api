import { SetMetadata } from '@nestjs/common';
import { RoleEnum } from '../../role/role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (RoleEnum | number | string)[]) =>
  SetMetadata(ROLES_KEY, roles);
