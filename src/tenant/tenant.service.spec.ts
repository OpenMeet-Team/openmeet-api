import { Test, TestingModule } from '@nestjs/testing';
import { TenantConnectionService } from './tenant.service';
import { randomUUID } from 'crypto';

describe('TenantConnectionService', () => {
  let service: TenantConnectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantConnectionService],
    }).compile();

    service = module.get<TenantConnectionService>(TenantConnectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should close the database connection', async () => {
    const tenantId = randomUUID();
    await service.closeDatabaseConnection(tenantId);
    expect(service['connections'].has(tenantId)).toBeFalsy();
  });

  it('should create a tenant connection', async () => {
    const connection = await service.getTenantConnection('1');
    expect(connection).toBeDefined();
    await service.closeDatabaseConnection('1');
  });

  it('should use the tenant connection when a query is made', async () => {
    const connection = await service.getTenantConnection('1');
    expect(connection.driver.schema).toEqual('tenant_1');
    await service.closeDatabaseConnection('1');
  });

  it('should create a schema if it does not exist and remove it', async () => {
    const tenantId = randomUUID();
    const connection = await service.getTenantConnection(tenantId);
    expect(connection.driver.schema).toEqual(`tenant_${tenantId}`);
    await service.removeTenantSchema(tenantId);
    expect(service['connections'].has(tenantId)).toBeFalsy();
  });
});
