import { Test, TestingModule } from '@nestjs/testing';
import { FileUploadHistoryController } from './file-upload-history.controller';

describe('FileUploadHistoryController', () => {
  let controller: FileUploadHistoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileUploadHistoryController],
    }).compile();

    controller = module.get<FileUploadHistoryController>(FileUploadHistoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
