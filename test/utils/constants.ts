export const TESTING_TENANT_ID = process.env.TEST_TENANT_ID as string;
export const TESTING_ADMIN_EMAIL = process.env.ADMIN_EMAIL as string;
export const TESTING_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD as string;
export const TESTING_ADMIN_ID = 1;
export const TESTING_USER_EMAIL = process.env.TEST_USER_EMAIL as string;
export const TESTING_USER_PASSWORD = process.env.TEST_USER_PASSWORD as string;
export const TESTING_USER_ID = 2;
export const TESTING_APP_URL =
  process.env.BACKEND_DOMAIN || `http://localhost:${process.env.APP_PORT}`;
export const TESTING_NGINX_URL =
  process.env.NGINX_URL || 'http://localhost:8080';
export const TESTING_MAIL_HOST = process.env.MAIL_HOST;
export const TESTING_MAIL_PORT = process.env.MAIL_CLIENT_PORT;
export const TESTING_MAS_URL =
  process.env.MAS_SERVICE_URL || 'http://localhost:8080';
export const TESTING_MAS_CLIENT_SECRET = process.env
  .MAS_CLIENT_SECRET as string;

// Matrix Application Service (MAS) Configuration for E2E Tests
export const TESTING_MATRIX_APPSERVICE_TOKEN = process.env
  .MATRIX_APPSERVICE_TOKEN as string;
export const TESTING_MATRIX_APPSERVICE_HS_TOKEN = process.env
  .MATRIX_APPSERVICE_HS_TOKEN as string;
export const TESTING_MATRIX_APPSERVICE_ID = process.env
  .MATRIX_APPSERVICE_ID as string;
export const TESTING_MATRIX_APPSERVICE_URL = process.env
  .MATRIX_APPSERVICE_URL as string;
export const TESTING_MATRIX_HOMESERVER_URL =
  process.env.MATRIX_HOMESERVER_URL || 'http://localhost:8448';
export const TESTING_MATRIX_SERVER_NAME =
  process.env.MATRIX_SERVER_NAME || 'matrix.openmeet.net';
