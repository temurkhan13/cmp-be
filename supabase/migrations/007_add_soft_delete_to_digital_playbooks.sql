-- Add soft-delete support to digital_playbooks (sitemaps)
ALTER TABLE digital_playbooks
ADD COLUMN IF NOT EXISTS is_soft_deleted BOOLEAN DEFAULT FALSE;

-- Backfill existing rows so they are not treated as NULL
UPDATE digital_playbooks SET is_soft_deleted = FALSE WHERE is_soft_deleted IS NULL;
