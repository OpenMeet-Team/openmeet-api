import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source';
import { getTenantConfig, fetchTenants } from '../utils/tenant-config';
import { TenantConfig } from '../core/constants/constant';
import { trace } from '@opentelemetry/api';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TenantConnectionService implements OnModuleInit {
  private readonly tracer = trace.getTracer('tenant-service');

  async onModuleInit() {}

  async getTenantConnection(tenantId: string): Promise<DataSource> {
    return this.tracer.startActiveSpan(
      'getTenantConnection',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          span.setAttribute('tenantId', tenantId);
          span.setAttribute('cache.lookup', true);

          const dataSource = AppDataSource(tenantId);

          // Add cache hit/miss tracking
          if (dataSource.isInitialized) {
            span.setAttribute('cache.hit', true);
            return dataSource;
          }

          span.setAttribute('cache.hit', false);
          const initSpan = this.tracer.startSpan('initializeDataSource');
          await dataSource.initialize();
          initSpan.end();

          // Only create schema for non-empty tenant IDs
          // Empty tenant ID ('') uses the 'public' schema
          if (tenantId && tenantId !== '') {
            const schemaSpan = this.tracer.startSpan('createSchema');
            await dataSource.query(
              `CREATE SCHEMA IF NOT EXISTS "tenant_${tenantId}"`,
            );
            schemaSpan.end();
          }

          return dataSource;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
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

  getAllTenants(): Promise<TenantConfig[]> {
    return this.tracer.startActiveSpan(
      'getAllTenants',
      { kind: SpanKind.CLIENT },
      (span) => {
        try {
          const tenants = fetchTenants();
          span.setAttribute('tenantsCount', tenants.length);
          return Promise.resolve(tenants);
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  async getAllTenantIds(): Promise<string[]> {
    return this.tracer.startActiveSpan(
      'getAllTenantIds',
      { kind: SpanKind.CLIENT },
      async (span) => {
        try {
          const tenants = await this.getAllTenants();
          const tenantIds = tenants.map((tenant) => tenant.id);
          span.setAttribute('tenantIdsCount', tenantIds.length);
          return tenantIds;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }
}
