import { registerAs } from '@nestjs/config';
import { MatrixConfig } from './matrix-config.type';

export const matrixConfig = registerAs<MatrixConfig>('matrix', () => {
  // Support both naming conventions for environment variables
  const baseUrl =
    process.env.MATRIX_BASE_URL ||
    process.env.MATRIX_SERVER_URL ||
    'https://matrix-dev.openmeet.net';
  const adminUser =
    process.env.MATRIX_ADMIN_USER ||
    process.env.MATRIX_ADMIN_USERNAME ||
    'admin';
  const adminAccessToken = process.env.MATRIX_ADMIN_ACCESS_TOKEN;

  console.log('Matrix configuration environment variables:', {
    MATRIX_BASE_URL: process.env.MATRIX_BASE_URL,
    MATRIX_SERVER_URL: process.env.MATRIX_SERVER_URL,
    MATRIX_ADMIN_USER: process.env.MATRIX_ADMIN_USER,
    MATRIX_ADMIN_USERNAME: process.env.MATRIX_ADMIN_USERNAME,
    MATRIX_ADMIN_ACCESS_TOKEN: adminAccessToken ? '***exists***' : 'undefined',
    MATRIX_SERVER_NAME: process.env.MATRIX_SERVER_NAME,
  });

  // Use proper Matrix server name
  // For Matrix IDs we need the main domain, not necessarily the server hostname
  const serverName = process.env.MATRIX_SERVER_NAME || 'openmeet.net';

  // Log the server name extraction
  console.log(
    'Using Matrix server name:',
    serverName,
    'with base URL:',
    baseUrl,
  );

  if (!adminAccessToken) {
    console.warn(
      'WARNING: Matrix admin access token is not set! User provisioning may fail.',
    );
  }

  return {
    baseUrl,
    adminUser,
    adminAccessToken: adminAccessToken || '',
    serverName,
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
