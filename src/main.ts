import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as figlet from 'figlet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
  // Crear el arte ASCII con Figlet
  console.clear();

  figlet('GRAN  RIFA  TECLADO  MECANICO', (err, data) => {
    console.log(data); // Imprimir el arte ASCII en la consola
  });
}
bootstrap();
