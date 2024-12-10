import zulipInit, { ZulipClient, ZulipInitialConfig } from 'zulip-js';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

const adminConfig = {
  username: process.env.ZULIP_USERNAME || '',
  apiKey: process.env.ZULIP_API_KEY || '',
  realm: process.env.ZULIP_REALM || '',
};

let zulipAdminClient: ZulipClient;

export const getClient = async (user: UserEntity) => {
  if (!user.zulipUsername || !user.zulipApiKey || !user.zulipUserId) {
    console.log('user', user);
    throw new Error('Zulip username, api key or user id not found');
  }
  return await zulipInit({
    username: user.zulipUsername,
    apiKey: user.zulipApiKey,
    realm: process.env.ZULIP_REALM || '',
  } as Partial<ZulipInitialConfig>);
};

export const getAdminClient = async () => {
  console.log('getAdminClient', adminConfig);
  if (!zulipAdminClient) {
    console.log('zulipAdminClient not found, initializing');
    zulipAdminClient = await zulipInit(
      adminConfig as Partial<ZulipInitialConfig>,
    );
  }
  console.log('zulipAdminClient', zulipAdminClient);
  return zulipAdminClient;
};
