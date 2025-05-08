import { Module } from '@nestjs/common';
import { FileUploadHistoryService } from './file-upload-history.service';
import { FileUploadHistoryController } from './file-upload-history.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { FileUploadHistory, FileUploadHistorySchema } from './file-upload-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FileUploadHistory.name, schema: FileUploadHistorySchema }]),
  ],
  providers: [FileUploadHistoryService],
  controllers: [FileUploadHistoryController],
  exports: [FileUploadHistoryService],
})
export class FileUploadHistoryModule { }
