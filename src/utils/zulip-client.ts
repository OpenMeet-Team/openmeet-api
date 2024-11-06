import path from 'path';
import zulipInit from 'zulip-js';

const config = { zuliprc: path.resolve(__dirname, '../..', 'zuliprc') };

let zulipClient: any;

export const initializeZulipClient = async () => {
  if (!zulipClient) {
    zulipClient = await zulipInit(config);
  }
  return zulipClient;
};
