import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatusSeedService } from './status-seed.service';
import { StatusEntity } from '../../../../status/infrastructure/persistence/relational/entities/status.entity';
import { TenantModule } from '../../../../tenant/tenant.module';

@Module({
  imports: [TenantModule, TypeOrmModule.forFeature([StatusEntity])],
  providers: [StatusSeedService],
  exports: [StatusSeedService],
})
export class StatusSeedModule {}
