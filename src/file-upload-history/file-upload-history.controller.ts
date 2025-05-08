import { Controller, Get, Param, Query } from '@nestjs/common';
import { FileUploadHistoryService } from './file-upload-history.service';

@Controller('file-upload-history')
export class FileUploadHistoryController {

    constructor(
        private readonly fileUploadHistoryService: FileUploadHistoryService,
    ) { }

    @Get()
    async findAll() {
        return this.fileUploadHistoryService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.fileUploadHistoryService.findOne(id);
    }

    @Get('operation-type/:operationType')
    async findByOperationType(@Param('operationType') operationType: string) {
        return this.fileUploadHistoryService.findByOperationType(operationType);
    }

    @Get('status/:status')
    async findByStatus(@Param('status') status: string) {
        return this.fileUploadHistoryService.findByStatus(status);
    }

    @Get('user-id/:userId')
    async findByUserId(@Param('userId') userId: string) {
        return this.fileUploadHistoryService.findByUserId(userId);
    }

    @Get('filter')
    async filter(@Query('filter') filter: any) {
        return this.fileUploadHistoryService.filter(filter);
    }
}
