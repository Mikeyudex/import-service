import { PartialType } from '@nestjs/mapped-types';


export class FileUploadHistoryDto {
    operationType: string;
    status: string;
    fileName: string;
    recordsProcessed: number;
    recordsFailed: number;
    uploadedBy: string;
    uploadDate?: Date;
    completionDate?: Date;
    errorMessage?: string;
}

export class UpdateFileUploadhistoryDto extends PartialType(FileUploadHistoryDto){
    operationType?: string;
    status?: string;
    recordsFailed?: number;
    recordsProcessed?: number;
    completionDate?: Date;
    errorMessage?: string;
}