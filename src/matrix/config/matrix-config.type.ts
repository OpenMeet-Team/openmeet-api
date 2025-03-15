export type MatrixConfig = {
  baseUrl: string;
  adminUser: string;
  adminAccessToken: string;
  serverName: string;
  defaultDeviceId: string;
  defaultInitialDeviceDisplayName: string;
  connectionPoolSize: number;
  connectionPoolTimeout: number;
  connectionRetryAttempts: number;
  connectionRetryDelay: number;
};
