export type MatrixConfig = {
  baseUrl: string;
  serverName: string;
  // Bot configuration (current implementation)
  bot: {
    username: string;
    password?: string;
    displayName: string;
  };
  // Application Service configuration
  appservice: {
    token: string;
    hsToken: string;
    id: string;
    url: string;
  };
  // Legacy admin configuration (deprecated)
  adminUser: string;
  adminPassword?: string;
  adminAccessToken?: string;
  // Connection settings
  defaultDeviceId: string;
  defaultInitialDeviceDisplayName: string;
  connectionPoolSize: number;
  connectionPoolTimeout: number;
  connectionRetryAttempts: number;
  connectionRetryDelay: number;
};
