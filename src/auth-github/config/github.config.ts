import { registerAs } from '@nestjs/config';

import { IsOptional, IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { GithubConfig } from './github-config.type';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  GITHUB_CLIENT_ID: string;

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_SECRET: string;
}

export default registerAs<GithubConfig>('github', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
});
