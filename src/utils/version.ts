import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface BuildInfo {
  version: string;
  commitHash: string;
  buildDate: string;
  branch: string;
  environment: string;
}

export function getBuildInfo(): BuildInfo {
  try {
    const gitCommitHash = execSync('git rev-parse --short HEAD')
      .toString()
      .trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD')
      .toString()
      .trim();
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
    );

    return {
      version: packageJson.version,
      commitHash: gitCommitHash,
      buildDate: new Date().toISOString(),
      branch: gitBranch,
      environment: process.env.NODE_ENV || 'development',
    };
  } catch (error) {
    console.warn('Failed to get build info:', error);
    return {
      version: '1.0.0',
      commitHash: 'unknown',
      buildDate: new Date().toISOString(),
      branch: 'unknown',
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
