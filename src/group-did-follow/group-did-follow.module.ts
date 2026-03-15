import { Module } from '@nestjs/common';
import { GroupDIDFollowService } from './group-did-follow.service';
import { TenantConnectionService } from '../tenant/tenant.service';

@Module({
  providers: [GroupDIDFollowService, TenantConnectionService],
  exports: [GroupDIDFollowService],
})
export class GroupDIDFollowModule {}
