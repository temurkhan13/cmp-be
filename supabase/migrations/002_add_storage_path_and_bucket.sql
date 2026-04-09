-- Add storage_path column to assessment_reports for Supabase Storage references
ALTER TABLE assessment_reports ADD COLUMN IF NOT EXISTS storage_path VARCHAR(2048) DEFAULT '';

-- Create the 'reports' storage bucket (public so PDFs can be downloaded via URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to the reports bucket
CREATE POLICY "Allow authenticated uploads to reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reports');

-- Allow public read access to reports bucket
CREATE POLICY "Allow public read access to reports"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'reports');

-- Allow authenticated users to delete their reports
CREATE POLICY "Allow authenticated deletes from reports"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'reports');

-- Allow service role full access (for backend operations)
CREATE POLICY "Allow service role full access to reports"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'reports');
