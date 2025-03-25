export type MatrixConfig = {
  baseUrl: string;
  adminUser: string;
  adminPassword: string; // Mandatory for token generation
  adminAccessToken?: string; // Optional now, will be generated dynamically
  serverName: string;
  defaultDeviceId: string;
  defaultInitialDeviceDisplayName: string;
  connectionPoolSize: number;
  connectionPoolTimeout: number;
  connectionRetryAttempts: number;
  connectionRetryDelay: number;
};
