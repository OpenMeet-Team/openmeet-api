import { registerAs } from '@nestjs/config';
import { BlueskyConfig } from './bluesky-config.type';

export default registerAs<BlueskyConfig>('bluesky', () => ({
  serviceUrl: process.env.BLUESKY_SERVICE_URL || 'https://bsky.social',
  clientId: process.env.BLUESKY_CLIENT_ID || '',
  clientSecret: process.env.BLUESKY_CLIENT_SECRET || '',
  redirectUri: process.env.BLUESKY_REDIRECT_URI || '',
}));
