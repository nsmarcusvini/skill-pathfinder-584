-- RUMVIA :: identidade (anônimo -> conta permanente)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_track_preferences
  ADD COLUMN IF NOT EXISTS market_segment text NOT NULL DEFAULT 'br';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_track_preferences_market_segment_check'
  ) THEN
    ALTER TABLE public.user_track_preferences
      ADD CONSTRAINT user_track_preferences_market_segment_check
      CHECK (market_segment IN ('br','remoto_global'));
  END IF;
END $$;

UPDATE public.user_track_preferences
SET market_segment = CASE WHEN region = 'remoto_global' THEN 'remoto_global' ELSE 'br' END
WHERE market_segment IS DISTINCT FROM CASE WHEN region = 'remoto_global' THEN 'remoto_global' ELSE 'br' END;

-- o perfil também é criado para visitantes anônimos
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, is_anonymous)
  VALUES (
    NEW.id,
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.is_anonymous, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- perfis existentes de contas com e-mail deixam de ser anônimos
UPDATE public.profiles p
SET is_anonymous = false
FROM auth.users u
WHERE u.id = p.id AND COALESCE(u.is_anonymous, false) = false;