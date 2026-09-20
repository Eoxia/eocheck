import { db } from '../db/index.js';

/**
 * Log an action into the actioncomm table (Dolibarr-style audit trail).
 * 
 * @param {string} label - Short description of the action
 * @param {string} note - Detailed notes about the action
 * @param {string} userId - User ID who performed the action
 * @param {string} elementType - Type of object related to the action (e.g., 'scan_profile', 'scan')
 * @param {number|string} elementId - ID of the object
 */
export function logAction(label, note, userId, elementType, elementId) {
  try {
    db.prepare(`
      INSERT INTO actioncomm (label, note, fk_user_author, elementtype, fk_element)
      VALUES (?, ?, ?, ?, ?)
    `).run(label, note || null, userId, elementType, elementId || null);
  } catch (error) {
    console.error('[ActionComm] Failed to log action:', error);
  }
}
