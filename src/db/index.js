import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { runMigrations } from './migrator.js';

dotenv.config();

const dbPath = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/^sqlite:\/\//, '')
  : './data/eocheck.db';

const resolvedDbPath = path.resolve(process.cwd(), dbPath);
const dataDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(resolvedDbPath);
db.pragma('journal_mode = WAL');

// Automatically ensure migrations are applied on startup
runMigrations();
