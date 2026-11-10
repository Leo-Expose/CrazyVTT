-- Schema migration: set the column default for newly inserted settings rows.
ALTER TABLE "SystemSettings"
  ALTER COLUMN "instanceName" SET DEFAULT 'CrazyVTT';
