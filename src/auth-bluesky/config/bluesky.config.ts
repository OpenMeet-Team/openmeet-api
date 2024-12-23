import { registerAs } from '@nestjs/config';
import { IsOptional, IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { BlueskyConfig } from './bluesky-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  BLUESKY_CLIENT_ID: string;

  @IsString()
  @IsOptional()
  BLUESKY_CLIENT_SECRET: string;
}

export default registerAs<BlueskyConfig>('bluesky', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    clientId: process.env.BLUESKY_CLIENT_ID,
    clientSecret: process.env.BLUESKY_CLIENT_SECRET,
  };
}); 