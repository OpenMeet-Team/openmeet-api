// This file extends the NodeJS namespace to include our environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    // Matrix configuration
    MATRIX_BASE_URL?: string;
    /** @deprecated Use MATRIX_ADMIN_USERNAME and MATRIX_SERVER_NAME instead. User ID is constructed as @username:server_name */
    MATRIX_ADMIN_USER?: string;
    MATRIX_ADMIN_USERNAME?: string;
    /** @deprecated Use MATRIX_ADMIN_PASSWORD instead. Tokens are now generated automatically. */
    MATRIX_ADMIN_ACCESS_TOKEN?: string;
    MATRIX_ADMIN_PASSWORD?: string; // Required for token generation
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
