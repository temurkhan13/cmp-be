-- Fix folder_assessment_media/documents/links FK constraints.
-- Two systems write to these tables:
--   1. Old: workSpaces/service.js inserts folder_assessments IDs
--   2. New: WorkspaceAssessments/service.js inserts workspace_assessments IDs
-- The FK pointed only at folder_assessments, causing silent insert failures
-- for the workspace assessment chat. Drop the FK so both systems can write.
-- Also adds the missing `url` column to folder_assessment_documents.

-- 1. folder_assessment_media — drop FK
ALTER TABLE folder_assessment_media
  DROP CONSTRAINT folder_assessment_media_assessment_id_fkey;

-- 2. folder_assessment_documents — drop FK + add missing url column
ALTER TABLE folder_assessment_documents
  DROP CONSTRAINT folder_assessment_documents_assessment_id_fkey;

ALTER TABLE folder_assessment_documents
  ADD COLUMN IF NOT EXISTS url VARCHAR(2048);

-- 3. folder_assessment_links — drop FK
ALTER TABLE folder_assessment_links
  DROP CONSTRAINT folder_assessment_links_assessment_id_fkey;
