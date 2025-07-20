import { DataSource } from 'typeorm';
import { Screenplay } from '../entities/Screenplay';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'screenwriting_tool',
  synchronize: process.env.NODE_ENV !== 'production', // Auto-create tables in dev
  logging: process.env.NODE_ENV === 'development',
  entities: [Screenplay],
  migrations: ['src/migrations/*.ts'],
  subscribers: [],
});