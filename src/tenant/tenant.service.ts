import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source';
@Injectable()
export class TenantConnectionService implements OnModuleInit {
  private connections: Map<string, DataSource> = new Map();
  async onModuleInit() {}
  async getTenantConnection(tenantId: string): Promise<DataSource> {
    const connection = this.connections.get(tenantId);
    if (connection && connection.isInitialized) {
      return connection;
    }

    // Create a DataSource and initialize the connection
    const dataSource = AppDataSource(tenantId);
    await dataSource.initialize();
    if (!tenantId) {
      return dataSource;
    }

    const schemaName = `tenant_${tenantId}`;

    // Create schema if it does not exist
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    // Cache the connection for reuse
    this.connections.set(tenantId, dataSource);
    return dataSource;
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
}
