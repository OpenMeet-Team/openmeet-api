import * as fs from 'fs';
import { TenantConfig } from '../core/constants/constant';

export function fetchTenants(): TenantConfig[] {
  try {
    // 0. Get base64 encoded json file from env variable
    const base64EncodedJson = process.env.TENANTS_B64;
    if (base64EncodedJson?.trim()) {
      const decodedJson = Buffer.from(base64EncodedJson, 'base64').toString(
        'utf8',
      );
      return JSON.parse(decodedJson);
    }
    // 1. Try command line --config argument
    const configArg = process.argv.find((arg) =>
      arg.startsWith('--tenant-config='),
    );
    if (configArg) {
      const configPath = configArg.split('=')[1];
      if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        try {
          return JSON.parse(fileContents);
        } catch (parseError) {
          console.error('Failed to parse config file:', parseError);
        }
      } else {
        console.error('Config file does not exist:', configPath);
      }
    }

    throw new Error(
      'No configuration found. Provide --tenant-config=file.json, mount a ConfigMap, or set TENANTS_B64',
    );
  } catch (error) {
    throw new Error(`Failed to load tenants configuration: ${error.message}`);
  }
}

export function getTenantConfig(tenantId: string): TenantConfig {
  const tenant = fetchTenants().find((t) => t.id === tenantId);
  if (!tenant) {
    throw new Error(`Tenant ${tenantId} not found`);
  }
  return tenant;
}
