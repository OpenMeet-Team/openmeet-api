import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MatrixService } from './matrix.service';
import { MatrixController } from './matrix.controller';
import { matrixConfig } from './config/matrix.config';
import { UserModule } from '../user/user.module';

@Module({
  imports: [ConfigModule.forFeature(matrixConfig), UserModule],
  controllers: [MatrixController],
  providers: [MatrixService],
  exports: [MatrixService],
})
export class MatrixModule {}
