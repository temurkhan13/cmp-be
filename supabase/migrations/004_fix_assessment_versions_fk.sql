-- Fix assessment_versions FK: should reference workspace_assessments, not assessments
ALTER TABLE assessment_versions
  DROP CONSTRAINT assessment_versions_assessment_id_fkey;

ALTER TABLE assessment_versions
  ADD CONSTRAINT assessment_versions_assessment_id_fkey
  FOREIGN KEY (assessment_id) REFERENCES workspace_assessments(id) ON DELETE CASCADE;
