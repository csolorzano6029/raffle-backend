import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { Person } from './entities/person.entity';
import { randomBytes } from 'crypto';
import * as chalk from 'chalk'; // Asegúrate de instalar este paquete: npm install chalk
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import { shuffle } from 'lodash';

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
    return await this.ticketRepository
      .createQueryBuilder('ticket')
      .select('ticket.ticket', 'ticket')
      .addSelect('UPPER(person.name)', 'name')
      .leftJoin('ticket.person', 'person')
      .orderBy('person.name', 'ASC')
      .getRawMany();
  }

  async findParticipants() {
    return await this.personRepository.find({
      relations: ['tickets'],
      order: {
        name: 'ASC', // Orden ascendente. Cambia a 'DESC' para descendente.
      },
    });
  }

  async findTicketPaid(paid: boolean): Promise<number> {
    return await this.ticketRepository
      .createQueryBuilder('ticket')
      .where('ticket.paid = :paid', { paid })
      .getCount();
  }

  async findPersonsPaid(paid: boolean) {
    const persons = await this.personRepository
      .createQueryBuilder('person')
      .leftJoinAndSelect('person.tickets', 'tickets')
      .where('tickets.paid = :paid', { paid })
      .orderBy('person.name', 'ASC')
      .getMany();

    return persons.map((person) => ({
      name: person.name?.toUpperCase(),
      tickets: person.tickets?.map((ticket) => ticket.ticket), // Extrae solo el campo `ticket`
    }));
  }

  async findTotalParticipants(): Promise<any> {
    const ticketsPaid = await this.findTicketPaid(true);
    const ticketsNoPaid = await this.findTicketPaid(false);
    const participantsPaid = await this.findPersonsPaid(true);
    const participantsNoPaid = await this.findPersonsPaid(false);
    const totalTickets = await this.findTickets();
    return {
      totalTickets: totalTickets.length,
      totalPaid: ticketsPaid,
      totalNoPaid: ticketsNoPaid,
      participantsPaid: participantsPaid,
      participantsNoPaid: participantsNoPaid,
    };
  }

  /*   async shuffle(tickets: any[]) {
    for (let i = tickets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tickets[i], tickets[j]] = [tickets[j], tickets[i]]; // Intercambia elementos
    }
    return tickets;
  } */

  async playRaffle(): Promise<{ eliminated: Ticket[]; winner: Ticket }> {
    const tickets = await this.findTickets();
    const particpants = await this.findParticipants();
    // Función para esperar 4 segundos
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    console.log('\n');
    console.log(
      '🔥 ================ LISTA DE PARTICIPANTES ================ 🔥',
    );
    let total = 1;
    for (const particpant of particpants) {
      console.log('\n');
      console.log(
        `✅ ${total} PARTICIPANTE: ${particpant.name.toUpperCase()} | TICKETS: ${particpant.tickets.length} ✅`,
      );
      total++;
      await delay(800); // Esperar 3 segundos
    }

    // Barajar los boletos
    const shuffled = shuffle(tickets);

    // Seleccionar los primeros 10 boletos
    const selected = shuffled.slice(0, 10);

    // Eliminar los primeros 9 y dejar el último como ganador
    const eliminated = selected.slice(0, 9);
    const winner = selected[9];

    // Imprimir eliminados uno por uno
    for (const currentTicket of eliminated) {
      console.log('\n');

      console.log(
        chalk.redBright(`❌ Eliminado:`),
        `TICKET: ${chalk.yellow(currentTicket.ticket)}`,
        `| PARTICIPANTE: ${chalk.cyan(currentTicket.name.toUpperCase())}`,
      );
      await delay(3000); // Esperar 3 segundos
    }

    // Imprimir el ganador
    console.log('\n');
    console.log(
      chalk.greenBright(`🎉 ¡Ganador!:`),
      `TICKET: ${chalk.yellow(winner.ticket)}`,
      `| PARTICIPANTE: ${chalk.cyan(winner.name.toUpperCase())}`,
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
