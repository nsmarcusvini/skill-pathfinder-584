DROP POLICY IF EXISTS cvs_storage_select_own ON storage.objects;
DROP POLICY IF EXISTS cvs_storage_insert_own ON storage.objects;
DROP POLICY IF EXISTS cvs_storage_update_own ON storage.objects;
DROP POLICY IF EXISTS cvs_storage_delete_own ON storage.objects;

CREATE POLICY cvs_storage_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY cvs_storage_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY cvs_storage_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY cvs_storage_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text);