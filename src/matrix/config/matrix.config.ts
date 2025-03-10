import { registerAs } from '@nestjs/config';
import { MatrixConfig } from './matrix-config.type';

export const matrixConfig = registerAs<MatrixConfig>('matrix', () => ({
  baseUrl: process.env.MATRIX_BASE_URL || 'https://matrix-dev.openmeet.net',
  adminUser: process.env.MATRIX_ADMIN_USER || 'admin',
  adminAccessToken: process.env.MATRIX_ADMIN_ACCESS_TOKEN || '',
  serverName: process.env.MATRIX_SERVER_NAME || 'matrix-dev.openmeet.net',
  defaultDeviceId: process.env.MATRIX_DEFAULT_DEVICE_ID || 'OPENMEET_SERVER',
  defaultInitialDeviceDisplayName: process.env.MATRIX_DEFAULT_DEVICE_DISPLAY_NAME || 'OpenMeet Server',
  connectionPoolSize: parseInt(process.env.MATRIX_CONNECTION_POOL_SIZE || '10', 10),
  connectionPoolTimeout: parseInt(process.env.MATRIX_CONNECTION_POOL_TIMEOUT || '30000', 10),
  connectionRetryAttempts: parseInt(process.env.MATRIX_CONNECTION_RETRY_ATTEMPTS || '3', 10),
  connectionRetryDelay: parseInt(process.env.MATRIX_CONNECTION_RETRY_DELAY || '1000', 10),
}));