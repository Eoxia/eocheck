import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync as Database } from 'node:sqlite';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/^sqlite:\/\//, '')
  : './data/eocheck.db';

// Ensure data directory exists
const resolvedDbPath = path.resolve(process.cwd(), dbPath);
const dataDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export function runMigrations() {
  console.log(`[DB Migrator] Connecting to SQLite database at: ${resolvedDbPath}`);
  const db = new Database(resolvedDbPath);
  db.exec('PRAGMA journal_mode = WAL;');

  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Get applied versions
  const appliedRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all();
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  // Find all migration files
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.js')).sort();

  console.log(`[DB Migrator] Found ${files.length} migration file(s).`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;
    
    // Import migration dynamically
    import(fileUrl).then((migration) => {
      if (!appliedVersions.has(migration.version)) {
        console.log(`[DB Migrator] Applying migration ${migration.version}_${migration.name}...`);
        try {
          db.exec('BEGIN');
          migration.up(db);
          db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
            migration.version,
            migration.name
          );
          db.exec('COMMIT');
          console.log(`[DB Migrator] Migration ${migration.version}_${migration.name} successfully applied.`);
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      } else {
        console.log(`[DB Migrator] Migration ${migration.version}_${migration.name} already applied.`);
      }
    }).catch((err) => {
      console.error(`[DB Migrator] Error applying migration ${file}:`, err);
    });
  }

  return db;
}

// Run directly if invoked from CLI
if (process.argv[1] && process.argv[1].includes('migrator.js')) {
  runMigrations();
}
