import { Module } from '@nestjs/common';
import { RelationalFilePersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { FilesS3PresignedModule } from './infrastructure/uploader/s3-presigned/file.module';
import { FileService } from './file.service';

const infrastructurePersistenceModule = RelationalFilePersistenceModule;

@Module({
  imports: [infrastructurePersistenceModule, FilesS3PresignedModule],
  providers: [FileService],
  exports: [FileService, infrastructurePersistenceModule],
})
export class FileModule {}
