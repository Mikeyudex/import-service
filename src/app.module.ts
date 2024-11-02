import { Module } from '@nestjs/common';
import * as Joi from 'joi';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ImportsModule } from './imports.module';
import { environments } from './environments';
import config from './config';
import { BullBoardService } from './common/config/bull-board.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: environments[process.env.NODE_ENV] || '.env',
      load: [config],
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().required(),
        MONGODB_URI: Joi.string().required(),
      })
    }),
    ImportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
