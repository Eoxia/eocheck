import crypto from 'crypto';

export const version = '003';
export const name = 'rbac_schema';

export function up(db) {
  // 1. Table user_groups
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Table group_permissions
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_permissions (
      group_id TEXT NOT NULL,
      permission_code TEXT NOT NULL,
      PRIMARY KEY (group_id, permission_code),
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
    );
  `);

  // 3. Table user_group_memberships
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_group_memberships (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      PRIMARY KEY (user_id, group_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
    );
  `);

  // 4. Initialiser les groupes de base
  const adminGroupId = crypto.randomUUID();
  const userGroupId = crypto.randomUUID();

  const insertGroup = db.prepare(`
    INSERT INTO user_groups (id, name, description) VALUES (?, ?, ?)
  `);
  insertGroup.run(adminGroupId, 'Administrateurs', 'Accès complet au système');
  insertGroup.run(userGroupId, 'Utilisateurs standards', 'Accès restreint aux scans');

  // 5. Migrer les utilisateurs existants
  const users = db.prepare('SELECT id, role FROM users').all();
  const insertMembership = db.prepare(`
    INSERT INTO user_group_memberships (user_id, group_id) VALUES (?, ?)
  `);
  
  for (const user of users) {
    if (user.role === 'admin') {
      insertMembership.run(user.id, adminGroupId);
    } else {
      insertMembership.run(user.id, userGroupId);
    }
  }

  // 6. Donner toutes les permissions de base aux administrateurs
  const initialPermissions = [
    'page:scans', 'page:settings', 'page:users', 'page:groups', 'page:system',
    'scan:launch', 'scan:delete',
    'settings:edit',
    'users:manage',
    'groups:manage'
  ];

  const insertPermission = db.prepare(`
    INSERT INTO group_permissions (group_id, permission_code) VALUES (?, ?)
  `);

  for (const perm of initialPermissions) {
    insertPermission.run(adminGroupId, perm);
  }

  // Pour le groupe utilisateur standard, on donne un accès minimal (par ex: voir les scans)
  const standardPermissions = [
    'page:scans'
  ];
  for (const perm of standardPermissions) {
    insertPermission.run(userGroupId, perm);
  }
}

export function down(db) {
  db.exec(`DROP TABLE IF EXISTS user_group_memberships;`);
  db.exec(`DROP TABLE IF EXISTS group_permissions;`);
  db.exec(`DROP TABLE IF EXISTS user_groups;`);
}
