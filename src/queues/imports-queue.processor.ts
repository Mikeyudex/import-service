import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

import { ImportsService } from '../imports.service';
import { JobsQueuesEnum, QueuesEnum } from '../../../apps/@shared/enums/queues.enum';
import { Logger } from '@nestjs/common';

@Processor(QueuesEnum.Imports)
export class ImportsQueueProcessor {
    logger = new Logger(ImportsQueueProcessor.name);
    constructor(private readonly importsService: ImportsService) { }

    @Process(JobsQueuesEnum.ImportProductsFromXlsx)
    async processHandleImportProductsFromXlsx(job: Job) {
        const data = job.data;
        this.logger.log('Importing products from xlsx');
        this.importsService.importProductsFromXlsx(data?.file, data?.companyId, job).
            then((result) => {
                job.log('Productos importados');
                //job.progress(100);
                job.isCompleted();
                return result;
            }).catch((error) => {
                job.log('Error durante la importación: ' + JSON.stringify(error));
                job.isFailed();
                job.progress(0);
                throw new Error('Error durante la importación: ' + JSON.stringify(error) + ' - JobID: ' + job.id);
            });
    }
}
