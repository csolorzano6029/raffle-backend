import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RaffleService } from './raffle.service';
import { RaffleController } from './raffle.controller';
import { Ticket } from './entities/ticket.entity';
import { Person } from './entities/person.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, Person])],
  controllers: [RaffleController],
  providers: [RaffleService],
})
export class RaffleModule {}
