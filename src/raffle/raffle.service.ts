import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { Person } from './entities/person.entity';
import { randomBytes } from 'crypto';
import * as chalk from 'chalk'; // Asegúrate de instalar este paquete: npm install chalk
import * as QRCode from 'qrcode';
import * as fs from 'fs';

@Injectable()
export class RaffleService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
  ) {}

  async createPerson(name: string, dni?: string): Promise<Person> {
    const person = this.personRepository.create({ name, dni });
    return this.personRepository.save(person);
  }

  async createTicket(personId: number, paid: boolean): Promise<Ticket> {
    const person = await this.personRepository.findOne({
      where: { id: personId },
    });

    if (!person) throw new Error('Person not found');

    // Generar un token único de 10 caracteres
    const ticket = randomBytes(5).toString('hex').substring(0, 10);

    // Generar el contenido del QR
    const qrData = `Name: ${person.name}, DNI: ${person.dni || 'N/A'}, Ticket: ${ticket}`;
    const qr = await QRCode.toDataURL(qrData);

    const newTicket = this.ticketRepository.create({
      person,
      ticket,
      paid,
      qr,
    });
    return this.ticketRepository.save(newTicket);
  }

  async updateQRCodes(): Promise<Ticket[]> {
    const tickets = await this.ticketRepository.find({ relations: ['person'] });

    for (const ticket of tickets) {
      if (!ticket.qr) {
        const qrData = `Name: ${ticket.person.name}, DNI: ${ticket.person.dni || 'N/A'}, Ticket: ${ticket.ticket}`;
        ticket.qr = await QRCode.toDataURL(qrData);
        await this.ticketRepository.save(ticket);
      }
    }

    return tickets;
  }

  async findTickets() {
    return await this.ticketRepository.find();
  }

  async findParticipants() {
    return await this.personRepository.find({
      relations: ['tickets'],
    });
  }

  async findTicketPaid(paid: boolean): Promise<any[]> {
    return await this.ticketRepository
      .createQueryBuilder('ticket')
      .select('person.name', 'name')
      .leftJoin('ticket.person', 'person')
      .where('ticket.paid = :paid', { paid })
      .distinctOn(['person.name'])
      .getRawMany();
  }

  async findTotalParticipants(): Promise<any> {
    const participantsPaid = await this.findTicketPaid(true);
    const participantsNoPaid = await this.findTicketPaid(false);
    const totalParticipants = await this.findTickets();
    return {
      totalParticipants: totalParticipants.length,
      totalPaid: participantsPaid?.length,
      totalNoPaid: participantsNoPaid?.length,
      paid: participantsPaid,
      noPaid: participantsNoPaid,
    };
  }

  async playRaffle(): Promise<{ eliminated: Ticket[]; winner: Ticket }> {
    const tickets = await this.ticketRepository.find({ relations: ['person'] });
    if (tickets.length < 10)
      throw new Error('Not enough tickets to play the raffle');

    // Barajar y seleccionar 5 boletos
    const shuffled = tickets.sort(() => Math.random() - 0.5).slice(0, 10);
    const eliminated = shuffled.slice(0, 9);
    const winner = shuffled[9];

    // Función para esperar 4 segundos
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // Imprimir eliminados uno por uno
    for (const currentTicket of eliminated) {
      console.log('\n');

      console.log(
        chalk.redBright(`❌ Eliminado:`),
        `Ticket: ${chalk.yellow(currentTicket.ticket)}`,
        `| Persona: ${chalk.cyan(currentTicket.person.name.toUpperCase())}`,
      );
      await delay(3000); // Esperar 3 segundos
    }

    // Imprimir el ganador
    console.log('\n');
    console.log(
      chalk.greenBright(`🎉 ¡Ganador!:`),
      `Token: ${chalk.yellow(winner.ticket)}`,
      `| Persona: ${chalk.cyan(winner.person.name.toUpperCase())}`,
    );

    return { eliminated, winner };
  }

  async generateHtmlWithQRCodes(): Promise<string> {
    const tickets = await this.ticketRepository.find({ relations: ['person'] });

    if (tickets.length === 0) {
      throw new Error('No tickets available to generate QR codes.');
    }

    // Iniciar el contenido HTML
    let htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Codes</title>
        <style>
          body { font-family: Arial, sans-serif; }
          .participant { margin-bottom: 20px; }
          .qr { margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>QR Codes for Participants</h1>
    `;

    // Agregar un bloque por cada participante
    for (const ticket of tickets) {
      const qrData = `Name: ${ticket.person.name}, DNI: ${ticket.person.dni || 'N/A'}, Ticket: ${ticket.ticket}`;
      const qrBase64 = await QRCode.toDataURL(qrData);

      htmlContent += `
        <div class="participant">
          <h2>Participant: ${ticket.person.name}</h2>
          <p>DNI: ${ticket.person.dni || 'N/A'}</p>
          <p>Ticket: ${ticket.ticket}</p>
          <img class="qr" src="${qrBase64}" alt="QR Code for ${ticket.person.name}">
        </div>
      `;
    }

    // Cerrar el contenido HTML
    htmlContent += `
      </body>
      </html>
    `;

    // Guardar el archivo en el sistema
    const filePath = 'qrcodes.html';
    fs.writeFileSync(filePath, htmlContent);

    return filePath; // Retornar la ruta del archivo
  }
}
