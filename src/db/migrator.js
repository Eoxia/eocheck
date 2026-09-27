import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbConnection } from './connection.js';
import { getDbConfig } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const pool = await getDbConnection();
  const config = getDbConfig();
  
  console.log(`[DB Migrator] Connexion à MariaDB (${config.database})`);

  try {
    // 1. Récupérer la version actuelle
    let currentVersion = '0.0.0';
    try {
      const [rows] = await pool.query(`SELECT value FROM ${config.prefix}const WHERE name = 'MAIN_DB_VERSION'`);
      if (rows.length > 0) {
        currentVersion = rows[0].value;
      }
    } catch (err) {
      console.warn(`[DB Migrator] Impossible de lire la version (la base n'est peut-être pas installée). Erreur: ${err.message}`);
      return;
    }

    console.log(`[DB Migrator] Version actuelle de la base : ${currentVersion}`);

    // 2. Trouver tous les fichiers de migration
    const migrationsDir = path.resolve(__dirname, '../../install/mysql/migration');
    if (!fs.existsSync(migrationsDir)) {
      console.log(`[DB Migrator] Aucun dossier de migration trouvé.`);
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      // Trie basique (Dolibarr utilise un tri complexe pour les versions, on simplifie pour l'exemple)
      .sort(); 

    let appliedCount = 0;

    for (const file of files) {
      // Nom du fichier type: 1.0.0-1.1.0.sql
      const match = file.match(/^([\d\.]+)-([\d\.]+)\.sql$/);
      if (match) {
        const targetVersion = match[2];
        
        // Comparaison simplifiée de versions (à améliorer si versions complexes type 1.10.0 > 1.2.0)
        // Pour l'instant, un simple localeCompare fonctionne sur les mêmes nombres de digits.
        if (targetVersion.localeCompare(currentVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
          console.log(`[DB Migrator] Application de la migration : ${file}...`);
          
          const filePath = path.join(migrationsDir, file);
          let sqlContent = fs.readFileSync(filePath, 'utf8');
          
          // Remplacement dynamique du préfixe Dolibarr-like (llx_)
          sqlContent = sqlContent.replace(/llx_/g, config.prefix);
          
          // Exécution du script de migration
          await pool.query(sqlContent);
          appliedCount++;
          
          // Mise à jour de la version courante en mémoire
          currentVersion = targetVersion;
          console.log(`[DB Migrator] Migration ${file} appliquée avec succès.`);
        }
      }
    }

    if (appliedCount === 0) {
      console.log(`[DB Migrator] La base de données est à jour.`);
    } else {
      console.log(`[DB Migrator] ${appliedCount} migration(s) appliquée(s). Nouvelle version : ${currentVersion}`);
    }

  } catch (err) {
    console.error('[DB Migrator] Erreur lors de la migration :', err);
    throw err;
  }
}

// Exécuter si appelé directement
if (process.argv[1] && process.argv[1].endsWith('migrator.js')) {
  runMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
}
