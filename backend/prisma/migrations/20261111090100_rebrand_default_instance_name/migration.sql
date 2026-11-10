-- Irreversible data migration: replace only the previous product default.
-- Custom instance names are left unchanged. Restore a database backup to undo.
UPDATE "SystemSettings"
SET "instanceName" = 'CrazyVTT'
WHERE "instanceName" = 'CozyVTT';
