import { getDbConnection } from '../db/connection.js';
import { getDbConfig } from '../config.js';

const config = getDbConfig();
const db = await getDbConnection();

/**
 * Log an action into the actioncomm table (Dolibarr-style audit trail).
 * 
 * @param {string} label - Short description of the action
 * @param {string} note - Detailed notes about the action
 * @param {string} userId - User ID who performed the action
 * @param {string} elementType - Type of object related to the action (e.g., 'scan_profile', 'scan')
 * @param {number|string} elementId - ID of the object
 */
export async function logAction(label, note, userId, elementType, elementId) {
  try {
    await db.query(`
      INSERT INTO ${config.prefix}actioncomm (label, note, fk_user_author, elementtype, fk_element)
      VALUES (?, ?, ?, ?, ?)
    `, [label, note || null, userId, elementType, elementId || null]);
  } catch (error) {
    console.error('[ActionComm] Failed to log action:', error);
  }
}
