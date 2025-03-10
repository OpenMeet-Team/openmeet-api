// This file extends the NodeJS namespace to include our environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    // Matrix configuration
    MATRIX_BASE_URL?: string;
    MATRIX_ADMIN_USER?: string;
    MATRIX_ADMIN_ACCESS_TOKEN?: string;
    MATRIX_SERVER_NAME?: string;
    MATRIX_REGISTRATION_SHARED_SECRET?: string;
    MATRIX_DEFAULT_DEVICE_ID?: string;
    MATRIX_DEFAULT_DEVICE_DISPLAY_NAME?: string;
    MATRIX_CONNECTION_POOL_SIZE?: string;
    MATRIX_CONNECTION_POOL_TIMEOUT?: string;
    MATRIX_CONNECTION_RETRY_ATTEMPTS?: string;
    MATRIX_CONNECTION_RETRY_DELAY?: string;
  }
}