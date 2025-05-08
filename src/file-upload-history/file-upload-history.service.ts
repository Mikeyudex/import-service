import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { FileUploadHistory, PurchaseOrderHistoryDocument } from './file-upload-history.schema';
import { FileUploadHistoryDto, UpdateFileUploadhistoryDto } from './dto/file-upload-history.dto';

@Injectable()
export class FileUploadHistoryService {
    constructor(
        @InjectModel(FileUploadHistory.name) private readonly fileUploadHistoryModel: Model<FileUploadHistory>,
    ) { }

    async create(fileUploadHistoryDto: FileUploadHistoryDto): Promise<PurchaseOrderHistoryDocument> {
        let fileUploadDoc = new this.fileUploadHistoryModel(fileUploadHistoryDto);
        await fileUploadDoc.save()
        return fileUploadDoc;
    }

    async findAll(): Promise<PurchaseOrderHistoryDocument[]> {
        return this.fileUploadHistoryModel.find().exec();
    }

    async findOne(id: string): Promise<PurchaseOrderHistoryDocument> {
        return this.fileUploadHistoryModel.findById(id).exec();
    }

    async update(id: string, fileUploadHistoryDto: UpdateFileUploadhistoryDto): Promise<PurchaseOrderHistoryDocument> {
        return this.fileUploadHistoryModel.findByIdAndUpdate(id, fileUploadHistoryDto, { new: true }).exec();
    }

    async delete(id: string): Promise<FileUploadHistory> {
        return this.fileUploadHistoryModel.findByIdAndDelete(id).exec();
    }

    async findByOperationType(operationType: string): Promise<PurchaseOrderHistoryDocument[]> {
        return this.fileUploadHistoryModel.find({ operationType }).exec();
    }

    async findByStatus(status: string): Promise<PurchaseOrderHistoryDocument[]> {
        return this.fileUploadHistoryModel.find({ status }).exec();
    }

    async findByUserId(userId: string): Promise<PurchaseOrderHistoryDocument[]> {
        return this.fileUploadHistoryModel.find({ uploadedBy: userId }).exec();
    }

    async filter(filter: FilterQuery<FileUploadHistory>): Promise<PurchaseOrderHistoryDocument[]> {
        return this.fileUploadHistoryModel.find(filter).exec();
    }
}
