import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as moment from 'moment-timezone';
import morgan from 'morgan';

async function bootstrap() {
  moment.tz.setDefault('America/Bogota');
  const app = await NestFactory.create(AppModule);
  app.use(morgan('dev'));
  await app.listen(process.env.PORT);
}
bootstrap();
