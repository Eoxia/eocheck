import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const confPath = path.resolve(__dirname, '../conf/conf.php');

export function getDbConfig() {
  if (!fs.existsSync(confPath)) {
    throw new Error(`Fichier de configuration introuvable : ${confPath}`);
  }

  const content = fs.readFileSync(confPath, 'utf8');
  
  // Fonction utilitaire pour extraire la valeur d'une variable PHP
  const extractVar = (varName) => {
    const regex = new RegExp(`\\$${varName}\\s*=\\s*['"](.*?)['"]\\s*;`);
    const match = content.match(regex);
    return match ? match[1] : null;
  };

  return {
    host: extractVar('eocheck_main_db_host') || 'localhost',
    port: extractVar('eocheck_main_db_port') || '3306',
    database: extractVar('eocheck_main_db_name') || 'eocheck',
    user: extractVar('eocheck_main_db_user') || 'root',
    password: extractVar('eocheck_main_db_pass') || '',
    type: extractVar('eocheck_main_db_type') || 'mariadb',
    prefix: extractVar('eocheck_main_db_prefix') || 'eocheck_',
    charset: extractVar('eocheck_main_db_character_set') || 'utf8mb4',
    collation: extractVar('eocheck_main_db_collation') || 'utf8mb4_unicode_ci',
    
    // Nouveaux paramètres type Dolibarr
    urlRoot: extractVar('eocheck_main_url_root') || 'http://localhost/eocheck',
    documentRoot: extractVar('eocheck_main_document_root') || '',
    urlRootAlt: extractVar('eocheck_main_url_root_alt') || '',
    documentRootAlt: extractVar('eocheck_main_document_root_alt') || '',
    dataRoot: extractVar('eocheck_main_data_root') || '',
    instanceUniqueId: extractVar('eocheck_main_instance_unique_id') || '',
    forceHttps: extractVar('eocheck_main_force_https') || '0',
    prod: extractVar('eocheck_main_prod') || '1'
  };
}
