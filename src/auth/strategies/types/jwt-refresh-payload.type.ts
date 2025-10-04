import { Session } from '../../../session/domain/session';

export type JwtRefreshPayloadType = {
  sessionId: Session['secureId'];
  hash: Session['hash'];
  iat: number;
  exp: number;
};
