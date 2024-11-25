import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';

export const mockUser = {
  id: 1,
  email: 'test@openmeet.net',
  password: 'password',
  firstName: 'John',
  lastName: 'Doe',
  name: 'John Doe',
  zulipUsername: 'test',
  zulipApiKey: 'test',
  zulipUserId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
} as UserEntity;

export const mockUserService = {
  findOne: jest.fn().mockResolvedValue(mockUser),
  findByEmail: jest.fn().mockResolvedValue(mockUser),
  findByUlid: jest.fn().mockResolvedValue(mockUser),
};

export const mockAuthService = {
  validateToken: jest.fn().mockResolvedValue(true),
};
