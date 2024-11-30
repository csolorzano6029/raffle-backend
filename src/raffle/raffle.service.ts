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
import { Catalogue } from './entities/catalogue.entity';
import { CatalogueValue } from 'src/constants/app.constant';

@Injectable()
export class RaffleService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
    @InjectRepository(Catalogue)
    private readonly catalogueRepository: Repository<Catalogue>,
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

  async findTickets(status?: string) {
    const tickets = this.ticketRepository
      .createQueryBuilder('ticket')
      .select('ticket.ticket', 'ticket')
      .addSelect('ticket.id', 'id')
      .addSelect('UPPER(person.name)', 'name')
      .leftJoin('ticket.person', 'person')
      .orderBy('person.name', 'ASC');

    if (status) {
      tickets.where('ticket.status = :status', { status });
    }

    return await tickets.getRawMany();
  }

  async findTicketById(id: number) {
    return await this.ticketRepository
      .createQueryBuilder('ticket')
      .where('ticket.id = :id', { id })
      .getOne();
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

  async findCatalogueByName(name: string): Promise<Catalogue> {
    return await this.catalogueRepository
      .createQueryBuilder('catalogue')
      .where('catalogue.name = :name', { name })
      .getOne();
  }

  async updateShiftCatalogue() {
    const shift = await this.findCatalogueByName(CatalogueValue.SHIFT);
    const total = Number(shift.value) + 1;
    shift.value = total.toString();
    return await this.catalogueRepository.save(shift);
  }

  async updateCatalogue(name: string, value: string) {
    const shift = await this.findCatalogueByName(name);
    shift.value = value;
    return await this.catalogueRepository.save(shift);
  }

  async updateTicket(id: number, status: string) {
    const ticket = await this.findTicketById(id);
    ticket.status = status;
    return await this.ticketRepository.save(ticket);
  }

  async updateTickets(ids: number[], status: string) {
    return await this.ticketRepository.update(ids, { status });
  }

  async playerRemove(tickets: any[]) {
    console.clear();
    // Función para esperar 4 segundos
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // Barajar los boletos
    const shuffled = shuffle(tickets);

    // Seleccionar los primeros 10 boletos
    const selected = shuffled.slice(0, tickets.length);

    // Eliminar los primeros 9 y dejar el último como ganador
    const players = selected.slice(0, tickets.length - 1);
    const eliminated = selected[tickets.length - 1];

    // Imprimir eliminados uno por uno
    for (const player of players) {
      console.log('\n');

      console.log(
        chalk.blueBright(`🎉 ¡Participante!:`),
        `TICKET: ${chalk.yellow(player.ticket)}`,
        `| PARTICIPANTE: ${chalk.cyan(player.name.toUpperCase())}`,
      );
      await delay(400); // Esperar 3 segundos
    }

    // Imprimir el ganador
    console.log('\n');
    console.log(
      chalk.redBright(`❌ Eliminado:`),
      `TICKET: ${chalk.yellow(eliminated.ticket)}`,
      `| PARTICIPANTE: ${chalk.cyan(eliminated.name.toUpperCase())}`,
    );

    await this.updateShiftCatalogue();
    await this.updateTicket(eliminated.id, '0');
  }

  async playerWinner(tickets: any[]) {
    console.clear();
    // Función para esperar 4 segundos
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // Barajar los boletos
    const shuffled = shuffle(tickets);

    // Seleccionar los primeros 10 boletos
    const selected = shuffled.slice(0, tickets.length);

    // Eliminar los primeros 9 y dejar el último como ganador
    const players = selected.slice(0, tickets.length - 1);
    const winner = selected[tickets.length - 1];

    // Imprimir eliminados uno por uno
    for (const player of players) {
      console.log('\n');

      console.log(
        chalk.blueBright(`🎉 ¡Participante!:`),
        `TICKET: ${chalk.yellow(player.ticket)}`,
        `| PARTICIPANTE: ${chalk.cyan(player.name.toUpperCase())}`,
      );
      await delay(400); // Esperar 3 segundos
    }

    // Imprimir el ganador
    console.log('\n');
    console.log(
      chalk.greenBright(`🎁 !Ganador!:`),
      `TICKET: ${chalk.yellow(winner.ticket)}`,
      `| PARTICIPANTE: ${chalk.cyan(winner.name.toUpperCase())}`,
    );
  }

  async playRaffle(): Promise<string> {
    const tickets = await this.findTickets('1');
    const { value: shift } = await this.findCatalogueByName(
      CatalogueValue.SHIFT,
    );
    const { value: totalShift } = await this.findCatalogueByName(
      CatalogueValue.TOTAL_SHIFT,
    );

    if (shift !== totalShift) {
      await this.playerRemove(tickets);
    } else {
      await this.playerWinner(tickets);
    }

    return 'Complete Game';
  }

  async resetRaffle() {
    const tickets = await this.findTickets('0');
    const ids: number[] = tickets.map((ticket) => {
      return ticket.id;
    });

    if (ids.length > 0) {
      await this.updateTickets(ids, '1');
    }

    await this.updateCatalogue(CatalogueValue.SHIFT, '1');

    return 'Reset Game';
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

  async listParticipants() {
    const particpants = await this.findParticipants();

    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    console.log('\n');
    console.log(`
    
             🎁  LISTA DE PARTICIPANTES 🎁           
    
    `);
    let total = 1;
    for (const particpant of particpants) {
      console.log('\n');
      console.log(
        `✅ ${total} PARTICIPANTE: ${particpant.name.toUpperCase()} | TICKETS: ${particpant.tickets.length} ✅`,
      );
      total++;
      await delay(1200); // Esperar 3 segundos
    }
  }
}
