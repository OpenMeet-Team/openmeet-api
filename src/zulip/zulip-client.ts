import zulipInit, { ZulipClient, ZulipInitialConfig } from 'zulip-js';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

const adminConfig = {
  username: process.env.ZULIP_USERNAME,
  apiKey: process.env.ZULIP_API_KEY,
  realm: process.env.ZULIP_REALM,
};

let zulipClient: ZulipClient;

export const getClient = async (user: UserEntity) => {
  if (!zulipClient) {
    zulipClient = await zulipInit({
      username: user.zulipUsername,
      apiKey: user.zulipApiKey,
      realm: process.env.ZULIP_REALM as string,
    } as Partial<ZulipInitialConfig>);
  }

  return zulipClient;
};

export const getAdminClient = async () => {
  if (!zulipClient) {
    zulipClient = await zulipInit(adminConfig as Partial<ZulipInitialConfig>);
  }

  return zulipClient;
};
