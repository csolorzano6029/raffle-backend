import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { RaffleService } from './raffle.service';
import { Response } from 'express';

@Controller('raffle')
export class RaffleController {
  constructor(private readonly raffleService: RaffleService) {}

  @Post('person')
  createPerson(@Body() body: { name: string; dni: string }) {
    return this.raffleService.createPerson(body.name, body.dni);
  }

  @Post('ticket')
  createTicket(@Body() body: { personId: number; paid: boolean }) {
    return this.raffleService.createTicket(body.personId, body.paid);
  }

  @Get('play')
  playRaffle() {
    return this.raffleService.playRaffle();
  }

  @Get('reset')
  resetRaffle() {
    return this.raffleService.resetRaffle();
  }

  @Get('participants')
  findParticipants() {
    return this.raffleService.findParticipants();
  }

  @Post('update-qrs')
  async updateQRCodes() {
    return this.raffleService.updateQRCodes();
  }

  @Get('generate-html')
  async generateHtmlWithQRCodes(@Res() res: Response) {
    try {
      const filePath = await this.raffleService.generateHtmlWithQRCodes();
      res.download(filePath, 'qrcodes.html', (err) => {
        if (err) {
          console.error('Error while sending the file:', err);
          res.status(500).send('Could not download the file.');
        }
      });
    } catch (error) {
      res.status(500).send(error.message);
    }
  }

  @Get('participants-paid')
  async findTotalParticipants() {
    return this.raffleService.findTotalParticipants();
  }

  @Get('list-participants')
  async listParticipants() {
    return this.raffleService.listParticipants();
  }
}
