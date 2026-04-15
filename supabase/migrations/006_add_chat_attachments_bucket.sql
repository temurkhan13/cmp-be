-- Add url column to folder_chat_documents so documents can link to Supabase Storage
ALTER TABLE folder_chat_documents ADD COLUMN IF NOT EXISTS url VARCHAR(2048) DEFAULT '';

-- Create the 'chat-attachments' storage bucket (public so files can be viewed via URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (idempotent - drop if exists then create)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow authenticated uploads to chat-attachments" ON storage.objects;
  DROP POLICY IF EXISTS "Allow public read access to chat-attachments" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated deletes from chat-attachments" ON storage.objects;
  DROP POLICY IF EXISTS "Allow service role full access to chat-attachments" ON storage.objects;
END $$;

CREATE POLICY "Allow authenticated uploads to chat-attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Allow public read access to chat-attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Allow authenticated deletes from chat-attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Allow service role full access to chat-attachments"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'chat-attachments');
