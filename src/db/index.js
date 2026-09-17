import fs from 'fs';
import path from 'path';
import { DatabaseSync as Database } from 'node:sqlite';
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
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

// Automatically ensure migrations are applied on startup
runMigrations();
