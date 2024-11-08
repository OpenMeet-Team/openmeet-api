// export const APP_URL = `http://localhost:${process.env.APP_PORT}`;
// export const TESTER_EMAIL = 'john.doe@openmeet.net';
// export const TESTER_PASSWORD = 'secret';
// export const TESTER_USER_ID = 2;
// export const ADMIN_EMAIL = 'admin@openmeet.net';
// export const ADMIN_PASSWORD = 'secret';
// export const ADMIN_USER_ID = 1;
// export const MAIL_HOST = process.env.MAIL_HOST;
// export const MAIL_PORT = process.env.MAIL_CLIENT_PORT;
// export const TESTING_TENANT_ID = process.env.TESTING_TENANT_ID || '1';

export const TESTING_ADMIN_EMAIL =
  process.env.TESTING_ADMIN_EMAIL || 'admin@openmeet.net';
export const TESTING_ADMIN_PASSWORD =
  process.env.TESTING_ADMIN_PASSWORD || 'secret';
export const TESTING_ADMIN_ID = Number(process.env.TESTING_ADMIN_ID) || 3;
export const TESTING_USER_EMAIL =
  process.env.TESTING_USER_EMAIL || 'john.doe@openmeet.net';
export const TESTING_USER_PASSWORD =
  process.env.TESTING_USER_PASSWORD || 'secret';
export const TESTING_USER_ID = Number(process.env.TESTING_USER_ID) || 1;
export const TESTING_EDITOR_EMAIL =
  process.env.TESTING_EDITOR_EMAIL || 'editor@openmeet.net';
export const TESTING_EDITOR_PASSWORD =
  process.env.TESTING_EDITOR_PASSWORD || 'secret';
export const TESTING_EDITOR_ID = Number(process.env.TESTING_EDITOR_ID) || 2;
export const TESTING_TENANT_ID = process.env.TESTING_TENANT_ID || '1';
export const TESTING_APP_URL = `http://localhost:${process.env.APP_PORT}`;
export const TESTING_MAIL_HOST = process.env.TESTING_MAIL_HOST;
export const TESTING_MAIL_PORT = process.env.TESTING_MAIL_PORT;
