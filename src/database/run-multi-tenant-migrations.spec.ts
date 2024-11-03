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
    // Reset fs mock
    (fs.existsSync as jest.Mock).mockReset();
    (fs.readFileSync as jest.Mock).mockReset();
  });

  it('should load tenants from config file', () => {
    // Mock command line argument
    process.argv.push('--tenant-config=./config/tenants.json');

    // Mock fs functions
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

    const result = fetchTenants();
    expect(result).toEqual(mockConfig);
  });

  it('should throw error when config file is missing', () => {
    process.argv.push('--tenant-config=./config/missing.json');
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    expect(() => fetchTenants()).toThrow();
  });

  it('should throw error when --tenant-config argument is missing', () => {
    expect(() => fetchTenants()).toThrow();
  });
});
