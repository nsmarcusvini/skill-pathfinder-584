ALTER TABLE public.cvs REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cvs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cvs;
  END IF;
END $$;