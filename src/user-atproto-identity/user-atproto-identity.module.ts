import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAtprotoIdentityEntity } from './infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import { UserAtprotoIdentityService } from './user-atproto-identity.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAtprotoIdentityEntity]),
    TenantModule,
  ],
  providers: [UserAtprotoIdentityService],
  exports: [UserAtprotoIdentityService],
})
export class UserAtprotoIdentityModule {}
