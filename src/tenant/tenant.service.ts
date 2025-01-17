import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { getTenantConfig } from '../utils/tenant-config';
import { TenantConfig } from '../core/constants/constant';
import { trace } from '@opentelemetry/api';

@Injectable()
export class TenantConnectionService implements OnModuleInit {
  private readonly tracer = trace.getTracer('tenant-service');
  private connections: Map<string, DataSource> = new Map();

  async onModuleInit() {}

  async getTenantConnection(tenantId: string): Promise<DataSource> {
    const span = this.tracer.startSpan('getTenantConnection');
    try {
      span.setAttribute('tenantId', tenantId);

      const connection = this.connections.get(tenantId);
      if (connection && connection.isInitialized) {
        span.setAttribute('connection.cached', true);
        return connection;
      }

      span.setAttribute('connection.cached', false);
      const initSpan = this.tracer.startSpan('initializeDataSource');
      const dataSource = AppDataSource(tenantId);
      await dataSource.initialize();
      initSpan.end();

      if (tenantId) {
        const schemaSpan = this.tracer.startSpan('createSchema');
        const schemaName = `tenant_${tenantId}`;
        await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
        schemaSpan.end();
      }

      this.connections.set(tenantId, dataSource);
      return dataSource;
    } finally {
      span.end();
    }
  }

  async closeDatabaseConnection(tenantId: string) {
    const connection = this.connections.get(tenantId);
    if (connection) {
      await connection.destroy();
      this.connections.delete(tenantId);
    }
  }

  async removeTenantSchema(tenantId: string): Promise<void> {
    const connection = this.connections.get(tenantId);
    if (connection) {
      const schemaName = `tenant_${tenantId}`;
      await connection.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      // Remove the connection from the map
      await connection.destroy();
      this.connections.delete(tenantId);
    } else {
      throw new Error(`Connection for tenant ${tenantId} does not exist.`);
    }
  }

  getTenantConfig(tenantId: string): TenantConfig {
    return getTenantConfig(tenantId);
  }
}
