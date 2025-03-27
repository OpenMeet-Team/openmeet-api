import { RoleEntity } from 'src/role/infrastructure/persistence/relational/entities/role.entity';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';

export const mockUser = {
  id: 1,
  email: 'test@openmeet.net',
  password: 'password',
  firstName: 'John',
  lastName: 'Doe',
  name: 'John Doe',
  matrixUserId: '@test:openmeet.net',
  slug: 'john-doe-abc123',
  ulid: '01234567890123456789012345',
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as UserEntity;

export const mockRole = {
  id: 1,
  name: 'admin',
} as RoleEntity;

export const mockUserService = {
  findOne: jest.fn().mockResolvedValue(mockUser),
  findByEmail: jest.fn().mockResolvedValue(mockUser),
  findByUlid: jest.fn().mockResolvedValue(mockUser),
  getUserById: jest.fn().mockResolvedValue(mockUser),
  getUserBySlug: jest.fn().mockResolvedValue(mockUser),
};

export const mockAuthService = {
  validateToken: jest.fn().mockResolvedValue(true),
};

export const mockRoleService = {
  findOne: jest.fn().mockResolvedValue(mockRole),
};
