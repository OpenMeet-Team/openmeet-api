import { User } from '../../user/domain/user';

export class Session {
  id: number | string;
  user: User;
  hash: string;
  secureId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
}
