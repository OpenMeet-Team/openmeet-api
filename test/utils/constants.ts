export const TESTING_TENANT_ID = process.env.TEST_TENANT_ID as string;
export const TESTING_ADMIN_EMAIL = process.env.ADMIN_EMAIL as string;
export const TESTING_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD as string;
export const TESTING_ADMIN_ID = 1;
export const TESTING_USER_EMAIL = process.env.TEST_USER_EMAIL as string;
export const TESTING_USER_PASSWORD = process.env.TEST_USER_PASSWORD as string;
export const TESTING_USER_ID = 2;
export const TESTING_APP_URL =
  process.env.BACKEND_DOMAIN || `http://localhost:${process.env.APP_PORT}`;
export const TESTING_MAIL_HOST = process.env.MAIL_HOST;
export const TESTING_MAIL_PORT = process.env.MAIL_CLIENT_PORT;
