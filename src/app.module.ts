import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ImportsModule } from './imports.module';


@Module({
  imports: [ImportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
