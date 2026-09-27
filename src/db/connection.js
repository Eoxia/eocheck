import mysql from 'mysql2/promise';
import { getDbConfig } from '../config.js';

let pool;

export async function getDbConnection() {
  if (pool) return pool;

  const config = getDbConfig();
  
  pool = mysql.createPool({
    host: config.host,
    port: parseInt(config.port, 10),
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true // Permet d'exécuter plusieurs requêtes SQL d'un coup
  });

  return pool;
}

export async function closeDbConnection() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
