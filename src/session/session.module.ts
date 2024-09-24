import { Module } from '@nestjs/common';
import { RelationalSessionPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { SessionService } from './session.service';
import { TenantModule } from '../tenant/tenant.module';

const infrastructurePersistenceModule = RelationalSessionPersistenceModule;

@Module({
  imports: [TenantModule, infrastructurePersistenceModule],
  providers: [SessionService],
  exports: [SessionService, infrastructurePersistenceModule],
})
export class SessionModule {}
