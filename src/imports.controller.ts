import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

import { AppService } from './app.service';
import { ImportsService } from './imports.service';

@Controller('import')
export class ImportsController {
  constructor(
    private readonly importService: ImportsService,
  ) { }

  @Get('/health')
  healthCheck() {
    return { success: true, message: 'OK' };
  }

  @Post('/import-products-xlsx/:companyId/:userId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'tmp'),
        filename: (req, file, cb) => {
          // Generar un nombre único para el archivo
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
          cb(null, filename);
        },
      }),
      fileFilter(req, file, cb) {
        if (!file.originalname.match(/\.(xlsx)$/)) {
          cb(new Error('Solo se admiten archivos .xlsx'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async importProducts(@UploadedFile() file: Express.Multer.File, @Res() res: Response, @Param('companyId') companyId: string, @Param('userId') userId: string) {
    res.status(200).json({ success: true, message: 'Solicitud recibida, se notificará cuando se haya completado la importación' });
    //this.importService.importProductsFromXlsxQueue(file, companyId);
    this.importService.importFromHttp(file, companyId, userId);
  }
}
