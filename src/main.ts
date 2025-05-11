import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { AppModule } from './app.module';
import { BullBoardService } from './common/config/bull-board.config';

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  //BullBoard configs
  const bullBoardService = app.get(BullBoardService);
  const serverAdapter = bullBoardService.getServerAdapter();

  // Configurar ruta para Bull Board
  app.use('/bull-board', serverAdapter.getRouter());

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [];
      if (process.env.NODE_ENV === 'local' || process.env.ENV === 'LOCAL') {
        allowedOrigins.push('http://localhost:3000');
        allowedOrigins.push('http://localhost:3001');
        allowedOrigins.push('http://localhost:3002');
      } else if (process.env.NODE_ENV === 'dev') {
        allowedOrigins.push('http://149.130.186.128:8080');
      }
      else if (process.env.NODE_ENV === 'prod') {
        allowedOrigins.push('http://149.130.186.128:8080');
      } else {
        allowedOrigins.push('http://149.130.186.128:8080');
      }
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("Allowed origins: " + allowedOrigins);
        console.log("Origin: " + origin);
        callback(new Error('No permitido por CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(process.env.PORT || 4405);
}
bootstrap();
