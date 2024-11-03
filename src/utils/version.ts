export interface BuildInfo {
  version: string;
  commitHash: string;
  buildDate: string;
  branch: string;
  environment: string;
}

export function getBuildInfo(): BuildInfo {
  try {
    const gitCommitHash = process.env.GIT_REVISION || '';
    const gitBranch = process.env.GIT_BRANCH || '';
    const packageJsonB64 = process.env.PACKAGE_JSON_B64 || '';
    console.log('packageJsonB64', packageJsonB64);

    const packageJson = JSON.parse(
      Buffer.from(packageJsonB64, 'base64').toString(),
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
