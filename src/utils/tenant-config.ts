import * as fs from 'fs';

export interface Tenant {
  id: string;
  name: string;
}

export function fetchTenants(): Tenant[] {
  try {
    // 1. Try command line --config argument
    const configArg = process.argv.find((arg) =>
      arg.startsWith('--tenant-config='),
    );
    if (configArg) {
      const configPath = configArg.split('=')[1];
      if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(fileContents);
      }
    }

    // 2. Try Kubernetes ConfigMap
    const k8sConfigPath = '/usr/src/app/config/tenants.json';
    if (fs.existsSync(k8sConfigPath)) {
      const fileContents = fs.readFileSync(k8sConfigPath, 'utf8');
      return JSON.parse(fileContents);
    }

    // 3. Get base64 encoded json file from env variable
    const base64EncodedJson = process.env.TENANTS_B64;
    console.log('base64EncodedJson', base64EncodedJson);
    if (base64EncodedJson) {
      const decodedJson = Buffer.from(base64EncodedJson, 'base64').toString(
        'utf8',
      );
      return JSON.parse(decodedJson);
    }

    throw new Error(
      'No configuration found. Provide --tenant-config=file.json, mount a ConfigMap, or set TENANTS_B64',
    );
  } catch (error) {
    throw new Error(`Failed to load tenants configuration: ${error.message}`);
  }
}
