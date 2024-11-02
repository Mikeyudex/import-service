import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BullBoardService } from './common/config/bull-board.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  //BullBoard configs
  const bullBoardService = app.get(BullBoardService);
  const serverAdapter = bullBoardService.getServerAdapter();

  // Configurar ruta para Bull Board
  app.use('/bull-board', serverAdapter.getRouter());

  await app.listen(process.env.PORT || 4405);
}
bootstrap();
