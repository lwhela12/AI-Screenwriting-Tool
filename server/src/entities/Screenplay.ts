import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('screenplays')
export class Screenplay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column({ nullable: true })
  author?: string;

  @Column({ nullable: true })
  contact?: string;

  @Column({ nullable: true })
  format?: string;

  @Column('json', { nullable: true })
  beats?: {
    beats: Record<string, {
      id: string;
      title: string;
      description: string;
      color: string;
    }>;
    lanes: Array<{
      id: string;
      title: string;
      beatIds: string[];
    }>;
  };

  @Column('json', { nullable: true })
  outline?: {
    cards: Record<string, {
      id: string;
      title: string;
      description: string;
      color: string;
    }>;
    lanes: Array<{
      id: string;
      title: string;
      cardIds: string[];
    }>;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}