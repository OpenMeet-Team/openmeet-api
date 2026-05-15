import { Module } from '@nestjs/common';
import { ContrailProvider } from './contrail.provider';

@Module({
  providers: [ContrailProvider],
  exports: [ContrailProvider],
})
export class ContrailXrpcModule {}
