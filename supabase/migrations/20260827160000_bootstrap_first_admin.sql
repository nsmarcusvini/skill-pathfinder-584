-- Bootstrap do primeiro administrador.
--
-- Problema: não há como se autopromover pela interface (seria um furo), então
-- num banco novo ninguém consegue entrar no /admin — o primeiro admin sempre
-- dependia de alguém rodar UPDATE manual no SQL.
--
-- Este gatilho resolve isso e se desliga sozinho: quando um e-mail específico se
-- cadastra E não existe nenhum admin ainda, ele vira admin. A partir do momento
-- em que houver um admin, o gatilho não faz mais nada — não é uma porta dos
-- fundos permanente, é uma semente que germina uma vez.
--
-- O e-mail fica no Vault, não em app_settings: aquela tabela é legível por
-- qualquer usuário autenticado (policy app_settings_read_authenticated), e o
-- repositório é público. Guardar ali revelaria quem administra a instância.
--
-- Para trocar o e-mail alvo:
--   SELECT vault.create_secret('novo@email.com', 'rumvia_bootstrap_admin_email',
--                              'E-mail promovido a admin enquanto não houver nenhum');

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, vault
AS $$
DECLARE
  _alvo text;
BEGIN
  -- Conta anônima nunca vira admin: não tem login para recuperar depois.
  IF NEW.email IS NULL OR COALESCE(NEW.is_anonymous, false) THEN
    RETURN NEW;
  END IF;

  -- E-mail não confirmado não conta: senão bastaria alguém tentar se cadastrar
  -- com o endereço certo para receber admin sem ter acesso à caixa.
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Já existe administrador: a semente não germina de novo.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE is_admin) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO _alvo
  FROM vault.decrypted_secrets
  WHERE name = 'rumvia_bootstrap_admin_email';

  IF _alvo IS NULL OR btrim(_alvo) = '' THEN
    RETURN NEW;
  END IF;

  IF lower(btrim(NEW.email)) <> lower(btrim(_alvo)) THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET is_admin = true
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon, authenticated;

-- INSERT cobre cadastro direto com e-mail.
-- UPDATE cobre o caminho principal do RUMVIA: visitante anônimo que converte a
-- sessão em conta permanente (updateUser), quando o INSERT já passou faz tempo.
-- O nome começa com "zz_" de propósito: o Postgres dispara gatilhos em ordem
-- alfabética, e este precisa rodar DEPOIS de on_auth_user_created, que é quem
-- cria a linha em profiles.
DROP TRIGGER IF EXISTS zz_bootstrap_first_admin ON auth.users;
CREATE TRIGGER zz_bootstrap_first_admin
  AFTER INSERT OR UPDATE OF email, email_confirmed_at, is_anonymous ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_admin();
