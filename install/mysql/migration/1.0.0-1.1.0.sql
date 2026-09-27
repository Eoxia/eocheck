-- Script de migration (Exemple) de la version 1.0.0 vers 1.1.0
-- Ce script sera exécuté par le migrator lors d'une montée de version.

-- Exemple d'ajout d'une colonne :
-- ALTER TABLE llx_users ADD COLUMN last_login DATETIME;

-- Mise à jour de la version dans la table de constante à la fin de la migration
UPDATE llx_const SET value = '1.1.0' WHERE name = 'MAIN_DB_VERSION';
