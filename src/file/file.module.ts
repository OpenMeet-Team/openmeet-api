import { Module } from '@nestjs/common';
import { RelationalFilePersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { FilesService } from './file.service';
import { FilesS3PresignedModule } from './infrastructure/uploader/s3-presigned/file.module';

const infrastructurePersistenceModule = RelationalFilePersistenceModule;
@Module({
  imports: [infrastructurePersistenceModule, FilesS3PresignedModule],
  providers: [FilesService],
  exports: [FilesService, infrastructurePersistenceModule],
})
export class FilesModule {}
