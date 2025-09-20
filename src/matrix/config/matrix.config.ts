import { registerAs } from '@nestjs/config';
import { MatrixConfig } from './matrix-config.type';

export const matrixConfig = registerAs<MatrixConfig>('matrix', () => {
  // Support all naming conventions for environment variables
  const baseUrl =
    process.env.MATRIX_HOMESERVER_URL ||
    process.env.MATRIX_BASE_URL ||
    process.env.MATRIX_SERVER_URL ||
    'https://matrix-dev.openmeet.net';
  // Use proper Matrix server name
  // For Matrix IDs we need the main domain, not necessarily the server hostname
  const serverName = process.env.MATRIX_SERVER_NAME || 'openmeet.net';

  // Bot configuration moved to tenant-based config in TENANTS_B64
  // MATRIX_BOT_USERNAME, MATRIX_BOT_PASSWORD, and MATRIX_BOT_DISPLAY_NAME are deprecated

  // Application Service configuration - required, no defaults
  const appserviceToken =
    process.env.MATRIX_APPSERVICE_TOKEN ||
    process.env.MATRIX_APPSERVICE_AS_TOKEN;
  const appserviceHsToken =
    process.env.MATRIX_APPSERVICE_HS_TOKEN ||
    process.env.MATRIX_APPSERVICE_HOMESERVER_TOKEN;
  const appserviceId = process.env.MATRIX_APPSERVICE_ID;
  const appserviceUrl = process.env.MATRIX_APPSERVICE_URL;

  // Validate required appservice configuration
  if (!appserviceToken) {
    throw new Error('MATRIX_APPSERVICE_TOKEN is required');
  }
  if (!appserviceHsToken) {
    throw new Error('MATRIX_APPSERVICE_HS_TOKEN is required');
  }
  if (!appserviceId) {
    throw new Error('MATRIX_APPSERVICE_ID is required');
  }
  if (!appserviceUrl) {
    throw new Error('MATRIX_APPSERVICE_URL is required');
  }

  // Legacy admin configuration (deprecated)
  const adminUsername = process.env.MATRIX_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.MATRIX_ADMIN_PASSWORD;
  const adminAccessToken = process.env.MATRIX_ADMIN_ACCESS_TOKEN || null;

  // MAS admin token for admin API operations
  const masAdminToken = process.env.MAS_ADMIN_TOKEN;

  console.log('Matrix configuration environment variables:', {
    MATRIX_HOMESERVER_URL: process.env.MATRIX_HOMESERVER_URL,
    MATRIX_BASE_URL: process.env.MATRIX_BASE_URL,
    MATRIX_SERVER_URL: process.env.MATRIX_SERVER_URL,
    MATRIX_ADMIN_USERNAME: process.env.MATRIX_ADMIN_USERNAME,
    MATRIX_ADMIN_PASSWORD: adminPassword ? '***exists***' : 'undefined',
    MATRIX_SERVER_NAME: process.env.MATRIX_SERVER_NAME,
    TENANT_BASED_BOTS: 'enabled (check TENANTS_B64)',
  });

  // Log the server name extraction and the final resolved URL
  console.log(
    'Using Matrix server name:',
    serverName,
    'with resolved base URL:',
    baseUrl,
  );

  return {
    baseUrl,
    serverName,
    // Bot configuration moved to tenant-based config (see MatrixBotUserService)
    // Application Service configuration
    appservice: {
      token: appserviceToken,
      hsToken: appserviceHsToken,
      id: appserviceId,
      url: appserviceUrl,
    },
    // Legacy admin configuration (deprecated)
    adminUser: adminUsername,
    adminPassword,
    adminAccessToken: adminAccessToken || '',
    // MAS admin token for admin API operations
    masAdminToken,
    // Connection settings
    defaultDeviceId: process.env.MATRIX_DEFAULT_DEVICE_ID || 'OPENMEET_SERVER',
    defaultInitialDeviceDisplayName:
      process.env.MATRIX_DEFAULT_DEVICE_DISPLAY_NAME || 'OpenMeet Server',
    connectionPoolSize: parseInt(
      process.env.MATRIX_CONNECTION_POOL_SIZE || '10',
      10,
    ),
    connectionPoolTimeout: parseInt(
      process.env.MATRIX_CONNECTION_POOL_TIMEOUT || '30000',
      10,
    ),
    connectionRetryAttempts: parseInt(
      process.env.MATRIX_CONNECTION_RETRY_ATTEMPTS || '3',
      10,
    ),
    connectionRetryDelay: parseInt(
      process.env.MATRIX_CONNECTION_RETRY_DELAY || '1000',
      10,
    ),
  };
});
