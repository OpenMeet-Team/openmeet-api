import { registerAs } from '@nestjs/config';

import { IsString, IsOptional, IsNumberString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { AuthConfig } from './auth-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  AUTH_JWT_SECRET: string;

  @IsString()
  AUTH_JWT_TOKEN_EXPIRES_IN: string;

  @IsString()
  AUTH_REFRESH_SECRET: string;

  @IsString()
  AUTH_REFRESH_TOKEN_EXPIRES_IN: string;

  @IsString()
  AUTH_FORGOT_SECRET: string;

  @IsString()
  AUTH_FORGOT_TOKEN_EXPIRES_IN: string;

  @IsString()
  AUTH_CONFIRM_EMAIL_SECRET: string;

  @IsString()
  AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN: string;

  @IsOptional()
  @IsNumberString()
  AUTH_EMAIL_VERIFICATION_CODE_LENGTH?: string;

  @IsOptional()
  @IsNumberString()
  AUTH_EMAIL_VERIFICATION_EXPIRY_SECONDS?: string;

  @IsOptional()
  @IsNumberString()
  AUTH_EMAIL_VERIFICATION_MAX_RETRIES?: string;
}

export default registerAs<AuthConfig>('auth', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    secret: process.env.AUTH_JWT_SECRET,
    expires: process.env.AUTH_JWT_TOKEN_EXPIRES_IN,
    refreshSecret: process.env.AUTH_REFRESH_SECRET,
    refreshExpires: process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN,
    forgotSecret: process.env.AUTH_FORGOT_SECRET,
    forgotExpires: process.env.AUTH_FORGOT_TOKEN_EXPIRES_IN,
    confirmEmailSecret: process.env.AUTH_CONFIRM_EMAIL_SECRET,
    confirmEmailExpires: process.env.AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN,
    emailVerification: {
      codeLength: parseInt(
        process.env.AUTH_EMAIL_VERIFICATION_CODE_LENGTH || '6',
        10,
      ),
      expirySeconds: parseInt(
        process.env.AUTH_EMAIL_VERIFICATION_EXPIRY_SECONDS || String(15 * 60), // 15 minutes default (was 7 days - reduced for security with 6-digit codes)
        10,
      ),
      maxCollisionRetries: parseInt(
        process.env.AUTH_EMAIL_VERIFICATION_MAX_RETRIES || '5',
        10,
      ),
    },
  };
});
