import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../database/data-source';

@Injectable()
export class TenantConnectionService implements OnModuleInit {
  private connections: Map<string, DataSource> = new Map();

  async onModuleInit() {
    // console.log('TenantConnectionService initialized');
    // // Example: Preload known tenant IDs and establish connections.
    // const knownTenants = ['1', '2', '4']; // You could fetch this from a database
    // for (const tenantId of knownTenants) {
    //   await this.getTenantConnection(tenantId);
    // }
    // console.log('All tenant connections initialized');
  }

  async getTenantConnection(tenantId: string): Promise<DataSource> {
    const connection = this.connections.get(tenantId);

    if (connection) {
      return connection;
    }

    // Create a DataSource and initialize the connection
    const dataSource = AppDataSource();
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
}
