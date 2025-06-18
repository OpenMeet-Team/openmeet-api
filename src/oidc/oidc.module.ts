import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { OidcController } from './oidc.controller';
import { OidcService } from './services/oidc.service';
import { UserModule } from '../user/user.module';
import { TenantModule } from '../tenant/tenant.module';
import { SessionModule } from '../session/session.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    TenantModule,
    SessionModule,
    AuthModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'secret',
    }),
  ],
  controllers: [OidcController],
  providers: [OidcService],
  exports: [OidcService],
})
export class OidcModule {}
