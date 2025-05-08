// counter.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { getCurrentUTCDate } from '../common/utils/getUtcDate';
import { Document, Types } from 'mongoose';

export type PurchaseOrderHistoryDocument = FileUploadHistory & Document;

export enum FileUploadStatusEnum {
    RECEIVED = 'received',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
}

export enum FileUploadOperationTypeEnum {
    PRODUCT_IMPORT = 'product_import',
    CATEGORY_IMPORT = 'category_import',
}

@Schema()
export class FileUploadHistory {
    @Prop({ required: true, enum: FileUploadOperationTypeEnum })
    operationType: string;

    @Prop({ required: true, enum: FileUploadStatusEnum })
    status: string;

    @Prop({ required: true, type: String })
    fileName: string;

    @Prop({ required: false, type: Number })
    recordsProcessed: number;

    @Prop({ required: false, type: Number })
    recordsFailed: number;

    @Prop({ required: false, type: String })
    errorMessage: string;

    @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
    uploadedBy: Types.ObjectId;

    @Prop({ default: () => getCurrentUTCDate() })
    uploadDate: Date;

    @Prop({ required: false, type: Date })
    completionDate: Date;
}

export const FileUploadHistorySchema = SchemaFactory.createForClass(FileUploadHistory);