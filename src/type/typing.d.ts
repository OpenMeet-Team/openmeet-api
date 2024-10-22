import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

declare module 'express' {
  export interface Request {
    user?: UserEntity;
  }
}
