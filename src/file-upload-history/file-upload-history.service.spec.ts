import { Test, TestingModule } from '@nestjs/testing';
import { FileUploadHistoryService } from './file-upload-history.service';

describe('FileUploadHistoryService', () => {
  let service: FileUploadHistoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileUploadHistoryService],
    }).compile();

    service = module.get<FileUploadHistoryService>(FileUploadHistoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
