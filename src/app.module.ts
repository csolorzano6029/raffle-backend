import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaffleModule } from './raffle/raffle.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '123456',
      database: 'raffle_db',
      autoLoadEntities: true,
      synchronize: true, // ¡Desactívalo en producción!
    }),
    RaffleModule,
  ],
})
export class AppModule {}
