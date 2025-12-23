export type AppConfig = {
  nodeEnv: string;
  name: string;
  workingDirectory: string;
  platformUrl?: string;
  frontendDomain?: string;
  backendDomain: string;
  oidcIssuerUrl: string;
  port: number;
  apiPrefix: string;
  fallbackLanguage: string;
  headerLanguage: string;
};
