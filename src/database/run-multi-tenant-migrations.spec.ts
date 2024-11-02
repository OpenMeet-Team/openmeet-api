import { fetchTenants } from './run-multi-tenant-migrations';

// Mock TypeORM's DataSource
jest.mock('typeorm', () => ({
  DataSource: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue([]),
    initialize: jest.fn().mockResolvedValue(undefined),
    runMigrations: jest.fn().mockResolvedValue([]),
    destroy: jest.fn().mockResolvedValue(undefined),
    createQueryRunner: jest.fn().mockReturnValue({
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    }),
  })),
}));

describe('Tenant Migrations', () => {
  const originalEnv = process.env.TENANTS;

  beforeAll(() => {
    // Setup any test database connections or mocks
  });

  afterAll(async () => {
    // Clean up any test database connections
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.TENANTS = originalEnv;
  });

  describe('fetchTenants', () => {
    const originalEnv = process.env.TENANTS;

    afterEach(() => {
      process.env.TENANTS = originalEnv;
    });

    it('should parse tenants configuration', () => {
      // Match the exact format from setup-local-env.sh
      process.env.TENANTS =
        '[{"id":"lsdfaopkljdfs","name":"OpenMeet"},{"id":"oiupsdknasfdf","name":"Testing"}]';
      const result = fetchTenants();
      expect(result).toEqual([
        { id: 'lsdfaopkljdfs', name: 'OpenMeet' },
        { id: 'oiupsdknasfdf', name: 'Testing' },
      ]);
    });

    it('should throw error when TENANTS env var is not set', () => {
      process.env.TENANTS = '';
      expect(() => fetchTenants()).toThrow(
        'TENANTS environment variable is not set',
      );
    });

    it('should throw error on invalid JSON', () => {
      process.env.TENANTS = 'invalid json';
      expect(() => fetchTenants()).toThrow();
    });
  });
});
