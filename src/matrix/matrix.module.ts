import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MatrixService } from './matrix.service';
import { matrixConfig } from './config/matrix.config';

@Module({
  imports: [
    ConfigModule.forFeature(matrixConfig),
  ],
  providers: [MatrixService],
  exports: [MatrixService],
})
export class MatrixModule {}