import { Module } from '@nestjs/common';
import { MatrixService } from './matrix.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  providers: [MatrixService],
  exports: [MatrixService],
})
export class MatrixModule {}
