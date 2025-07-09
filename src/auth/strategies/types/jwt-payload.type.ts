import { Session } from '../../../session/domain/session';
import { User } from '../../../user/domain/user';

export type JwtPayloadType = Pick<User, 'id' | 'role' | 'slug'> & {
  sessionId: Session['id'];
  tenantId: string;
  iat: number;
  exp: number;
};
