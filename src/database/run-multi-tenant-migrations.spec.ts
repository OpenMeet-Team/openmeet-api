import * as fs from 'fs';

import { fetchTenants } from '../utils/tenant-config';

jest.mock('fs');

describe('fetchTenants', () => {
  const mockConfig = [
    { id: '1', name: 'OpenMeet' },
    { id: '2', name: 'Testing' },
  ];

  beforeEach(() => {
    // Reset process.argv
    process.argv = ['node', 'script.js'];

    (fs.existsSync as jest.Mock).mockImplementation(() => true);
    (fs.readFileSync as jest.Mock).mockImplementation(() =>
      JSON.stringify(mockConfig),
    );
  });

  it('should load tenants from config file', () => {
    // Mock command line argument
    // simulate a temp file path
    const tempFilePath = './tenants-config-test.json';
    process.argv.push(`--tenant-config=${tempFilePath}`);
    process.env.TENANTS_B64 = '';

    // Mock fs functions
    const result = fetchTenants();
    expect(result).toEqual(mockConfig);
  });

  it('should load tenants from base64 encoded json', () => {
    try {
      process.env.TENANTS_B64 = Buffer.from(
        JSON.stringify(mockConfig),
      ).toString('base64');
    } catch (error) {
      console.error('Failed to encode mockConfig to base64:', error);
    }
    const result = fetchTenants();
    expect(result).toEqual(mockConfig);
  });
});
