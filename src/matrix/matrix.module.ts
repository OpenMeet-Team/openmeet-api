import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MatrixService } from './matrix.service';
import { MatrixController } from './matrix.controller';
import { matrixConfig } from './config/matrix.config';
import { UserModule } from '../user/user.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    ConfigModule.forFeature(matrixConfig),
    UserModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [MatrixController],
  providers: [MatrixService],
  exports: [MatrixService],
})
export class MatrixModule {}
