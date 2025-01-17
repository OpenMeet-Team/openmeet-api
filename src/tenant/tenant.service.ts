import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { getTenantConfig } from '../utils/tenant-config';
import { TenantConfig } from '../core/constants/constant';
import { trace } from '@opentelemetry/api';

@Injectable()
export class TenantConnectionService implements OnModuleInit {
  private readonly tracer = trace.getTracer('tenant-service');

  async onModuleInit() {}

  async getTenantConnection(tenantId: string): Promise<DataSource> {
    const span = this.tracer.startSpan('getTenantConnection');
    try {
      span.setAttribute('tenantId', tenantId);

      const dataSource = AppDataSource(tenantId);

      // Initialize if needed (AppDataSource handles caching internally)
      if (!dataSource.isInitialized) {
        const initSpan = this.tracer.startSpan('initializeDataSource');
        await dataSource.initialize();
        initSpan.end();

        if (tenantId) {
          const schemaSpan = this.tracer.startSpan('createSchema');
          const schemaName = `tenant_${tenantId}`;
          await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
          schemaSpan.end();
        }
      }

      return dataSource;
    } finally {
      span.end();
    }
  }

  async closeDatabaseConnection(tenantId: string) {
    const dataSource = AppDataSource(tenantId);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }

  async removeTenantSchema(tenantId: string): Promise<void> {
    const dataSource = AppDataSource(tenantId);
    if (dataSource.isInitialized) {
      const schemaName = `tenant_${tenantId}`;
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    } else {
      throw new Error(`Connection for tenant ${tenantId} does not exist.`);
    }
  }

  getTenantConfig(tenantId: string): TenantConfig {
    return getTenantConfig(tenantId);
  }
}
