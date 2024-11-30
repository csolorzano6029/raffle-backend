import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { Person } from './person.entity';

@Entity()
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 10, unique: true })
  ticket: string;

  @Column()
  paid: boolean;

  @Column({ type: 'text', nullable: true })
  qr: string;

  @Column({ length: 1 })
  status: string;

  @ManyToOne(() => Person, (person) => person.tickets, { onDelete: 'CASCADE' })
  person: Person;
}
