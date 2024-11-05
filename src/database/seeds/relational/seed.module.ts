import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { TypeOrmConfigService } from '../../typeorm-config.service';
import { RoleSeedModule } from './role/role-seed.module';
import { StatusSeedModule } from './status/status-seed.module';
import { UserSeedModule } from './user/user-seed.module';
import databaseConfig from '../../config/database.config';
import appConfig from '../../../config/app.config';
import { CategorySeedModule } from './category/category-seed.module';
import { PermissionSeedModule } from './permission/permission-seed.module';
import { UserPermissionSeedModule } from './user-permission/user-permission-seed.module';
import { GroupRoleSeedModule } from './group-role/group-role.module';
import { GroupSeedModule } from './group/group-seed.module';
import fileConfig from '../../../file/config/file.config';
import { EventSeedModule } from './event/event-seed.module';
import authConfig from '../../../auth/config/auth.config';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    EventSeedModule,
    RoleSeedModule,
    StatusSeedModule,
    UserSeedModule,
    CategorySeedModule,
    PermissionSeedModule,
    UserPermissionSeedModule,
    GroupRoleSeedModule,
    GroupSeedModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, appConfig, fileConfig, authConfig],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      useClass: TypeOrmConfigService,
      dataSourceFactory: async (options: DataSourceOptions) => {
        return new DataSource(options).initialize();
      },
    }),
  ],
})
export class SeedModule {}
