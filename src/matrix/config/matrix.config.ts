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

  // Get username portion of admin user
  const adminUsername = process.env.MATRIX_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.MATRIX_ADMIN_PASSWORD;

  // Admin access token is optional and will be generated using the password
  const adminAccessToken = process.env.MATRIX_ADMIN_ACCESS_TOKEN || null;

  console.log('Matrix configuration environment variables:', {
    MATRIX_HOMESERVER_URL: process.env.MATRIX_HOMESERVER_URL,
    MATRIX_BASE_URL: process.env.MATRIX_BASE_URL,
    MATRIX_SERVER_URL: process.env.MATRIX_SERVER_URL,
    MATRIX_ADMIN_USERNAME: process.env.MATRIX_ADMIN_USERNAME,
    MATRIX_ADMIN_PASSWORD: adminPassword ? '***exists***' : 'undefined',
    MATRIX_SERVER_NAME: process.env.MATRIX_SERVER_NAME,
  });

  // Log the server name extraction and the final resolved URL
  console.log(
    'Using Matrix server name:',
    serverName,
    'with resolved base URL:',
    baseUrl,
  );

  if (!adminPassword) {
    throw new Error(
      'MATRIX_ADMIN_PASSWORD is required! Please set this environment variable.',
    );
  }

  return {
    baseUrl,
    adminUser: adminUsername, // Just use the username, we'll construct the full ID in the service
    adminPassword,
    adminAccessToken: adminAccessToken || '', // Will be generated if not provided
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
