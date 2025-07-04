import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MatrixController } from './matrix.controller';
import { MatrixAppServiceController } from './controllers/matrix-appservice.controller';
import { matrixConfig } from './config/matrix.config';
import { UserModule } from '../user/user.module';
import { UserService } from '../user/user.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { MatrixCoreService } from './services/matrix-core.service';
import { MatrixUserService } from './services/matrix-user.service';
import { MatrixRoomService } from './services/matrix-room.service';
import { MatrixMessageService } from './services/matrix-message.service';
import { MatrixTokenManagerService } from './services/matrix-token-manager.service';
import { MatrixHealthIndicator } from './health/matrix.health';
import { configureMatrixLogging } from './config/matrix-logger';
import { GlobalMatrixValidationService } from './services/global-matrix-validation.service';
import { MatrixHandleMigrationService } from './services/matrix-handle-migration.service';
import { MatrixBotService } from './services/matrix-bot.service';
import { MatrixBotUserService } from './services/matrix-bot-user.service';
import { MatrixBotRotationService } from './services/matrix-bot-rotation.service';
import { TenantBotSetupService } from './services/tenant-bot-setup.service';

// Configure Matrix logging at module load time
// This runs before the module is instantiated
configureMatrixLogging();

@Module({
  imports: [
    ConfigModule.forFeature(matrixConfig),
    ScheduleModule.forRoot(),
    forwardRef(() => UserModule),
    TenantModule,
    forwardRef(() => AuthModule),
    EventEmitterModule.forRoot({
      // Set wildcard to true to support event namespaces
      wildcard: true,
      // Maximum number of listeners per event
      maxListeners: 20,
    }),
    JwtModule.register({
      global: true,
      // JWT configuration should match your existing auth setup
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [MatrixController, MatrixAppServiceController],
  providers: [
    // Matrix services
    MatrixTokenManagerService, // Token manager must be initialized before core service
    MatrixCoreService,
    MatrixBotService,
    MatrixBotUserService,
    MatrixBotRotationService,
    TenantBotSetupService,
    MatrixUserService,
    MatrixRoomService,
    MatrixMessageService,
    MatrixHealthIndicator,
    GlobalMatrixValidationService,
    MatrixHandleMigrationService,

    // User service provider
    {
      provide: 'USER_SERVICE_FOR_MATRIX',
      useExisting: forwardRef(() => UserService),
    },
  ],
  exports: [
    // Export services
    MatrixCoreService,
    MatrixBotService,
    MatrixBotUserService,
    MatrixBotRotationService,
    TenantBotSetupService,
    MatrixUserService,
    MatrixRoomService,
    MatrixMessageService,
    MatrixTokenManagerService,
    MatrixHealthIndicator,
    GlobalMatrixValidationService,
  ],
})
export class MatrixModule {}
