import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import { getDbConfig } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runInstaller() {
  const config = getDbConfig();
  console.log(`[Installer] Configuration chargée. Serveur : ${config.host}:${config.port}`);

  let connection;
  try {
    // 1. Connexion initiale SANS spécifier la base de données (pour pouvoir la créer)
    console.log(`[Installer] Connexion au serveur MariaDB...`);
    connection = await mysql.createConnection({
      host: config.host,
      port: parseInt(config.port, 10),
      user: config.user, // root ou admin ayant les droits de création
      password: config.password,
      multipleStatements: true
    });

    // 2. Création de la base de données et de l'utilisateur (si on veut un utilisateur spécifique)
    console.log(`[Installer] Création de la base de données '${config.database}' si elle n'existe pas...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET ${config.charset} COLLATE ${config.collation};`);
    
    // Facultatif : Si l'utilisateur n'est pas root, on pourrait le créer ici.
    // Exemple : CREATE USER IF NOT EXISTS 'eocheck_user'@'localhost' IDENTIFIED BY 'password';
    // Exemple : GRANT ALL PRIVILEGES ON \`${config.database}\`.* TO 'eocheck_user'@'localhost';

    // 3. Sélection de la base de données
    await connection.query(`USE \`${config.database}\`;`);

    // 4. Lecture et exécution du script install.sql
    const sqlPath = path.resolve(__dirname, '../../install/mysql/tables/install.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Fichier d'installation SQL introuvable : ${sqlPath}`);
    }

    console.log(`[Installer] Exécution du script ${sqlPath}...`);
    let sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Remplacement dynamique du préfixe Dolibarr-like (llx_) par celui de la config
    sqlContent = sqlContent.replace(/llx_/g, config.prefix);
    
    // Exécution du script entier (grâce à multipleStatements: true)
    await connection.query(sqlContent);
    console.log(`[Installer] Structure initiale créée avec succès.`);

  } catch (err) {
    console.error('[Installer] Erreur lors de l\'installation :', err);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Exécuter si appelé directement
if (process.argv[1] && process.argv[1].endsWith('installer.js')) {
  runInstaller();
}
