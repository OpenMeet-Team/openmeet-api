export type AuthConfig = {
  secret?: string;
  expires?: string;
  refreshSecret?: string;
  refreshExpires?: string;
  forgotSecret?: string;
  forgotExpires?: string;
  confirmEmailSecret?: string;
  confirmEmailExpires?: string;
  emailVerification?: {
    codeLength: number;
    expirySeconds: number;
    maxCollisionRetries: number;
  };
};
