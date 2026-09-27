import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';
import fs from 'fs';
import path from 'path';

export async function getDbInfo(req, res, next) {
  try {
    const config = getDbConfig();
    const pool = await getDbConnection();

    // 1. Infos globales
    const [versionRows] = await pool.query('SELECT VERSION() as version');
    const mariadbVersion = versionRows[0].version;

    // 2. Infos de version EOCheck depuis la base
    const [constRows] = await pool.query(`SELECT value FROM ${config.prefix}const WHERE name = 'MAIN_DB_VERSION'`);
    const dbVersion = constRows.length > 0 ? constRows[0].value : 'Inconnue';

    // 3. Liste des tables et statistiques
    const [tablesRows] = await pool.query(`
      SELECT 
        TABLE_NAME as name,
        ENGINE as engine,
        ROW_FORMAT as format,
        TABLE_ROWS as rows_count,
        AVG_ROW_LENGTH as avg_row_length,
        DATA_LENGTH as data_length,
        MAX_DATA_LENGTH as max_data_length,
        INDEX_LENGTH as index_length,
        AUTO_INCREMENT as auto_increment,
        TABLE_COLLATION as collation
      FROM information_schema.tables
      WHERE table_schema = ? AND TABLE_NAME LIKE ?
    `, [config.database, `${config.prefix}%`]);

    const info = {
      database: {
        type: config.type,
        version: mariadbVersion,
        host: config.host,
        port: config.port,
        name: config.database,
        user: config.user,
        charset: config.charset,
        collation: config.collation,
        prefix: config.prefix
      },
      eocheck: {
        version: dbVersion
      },
      tables: tablesRows
    };

    res.json(info);
  } catch (error) {
    console.error('[System Controller] Error fetching DB info:', err);
    const err = new Error('Error');
    err.code = 'ERR_SYSTEM_41';
    return next(err);
  }
}
