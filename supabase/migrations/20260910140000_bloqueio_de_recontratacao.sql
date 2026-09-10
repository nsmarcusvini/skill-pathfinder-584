-- =============================================================================
-- Bloqueio de recontratação depois de estorno (art. 49) ou chargeback.
--
-- O QUE ISTO FECHA
-- `encerrarAssinaturaViva` devolve o valor cheio dentro dos 7 dias do CDC art.
-- 49 — e está certo, é obrigação legal. Só que, depois do estorno, o status
-- vira `refunded`/`cancelled`, que não estão em LIVE_STATUSES, e
-- `startSubscriptionCheckout` só recusa quem tem assinatura VIVA. O resultado
-- era um laço sem fim: assinar → usar 6 dias → pedir estorno → assinar de novo
-- no dia 8, com o mesmo e-mail e sem nenhum atrito. Acesso vitalício de graça.
--
-- A DISTINÇÃO QUE SUSTENTA ISTO
-- Devolver o dinheiro de quem desistiu é obrigação, e não dá para renunciar por
-- contrato (art. 51, I — cláusula de renúncia é nula). VENDER DE NOVO para a
-- mesma pessoa não é obrigação nenhuma: ninguém é obrigado a contratar. A
-- primeira vez é o direito sendo exercido; a segunda é padrão de uso. Este
-- bloqueio não retém um centavo de ninguém — só recusa a próxima venda.
--
-- CHARGEBACK ENTRA JUNTO, E É MAIS GRAVE
-- No estorno a pessoa pediu para nós. No chargeback ela pediu à bandeira, o
-- dinheiro volta sem passar por aqui e ainda custa taxa. `cancelled_due_to`
-- já distingue os dois (webhook.server.ts); o bloqueio trata os dois igual.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.resubscribe_blocks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SEM foreign key para auth.users, de propósito, e isto é o ponto inteiro da
  -- tabela. Um ON DELETE CASCADE aqui transformaria "excluir a conta" — que é
  -- direito de LGPD e tem botão em /conta — na forma mais barata de limpar a
  -- ficha: estorna, exclui a conta, cria outra, recomeça. O bloqueio precisa
  -- sobreviver ao usuário que o originou. O preço é que este user_id pode
  -- apontar para ninguém; é esperado, e por isso ele não é a única chave.
  user_id              uuid,

  -- Cliente no gateway (cust_... no Asaas). É o elo mais forte disponível,
  -- porque a página hospedada coleta CPF e o RUMVIA nunca precisa pedir esse
  -- dado (docs/PAGAMENTOS.md). Só é conhecido DEPOIS do primeiro pagamento —
  -- o webhook aprende em qualquer PAYMENT_* —, então não serve para barrar no
  -- checkout; serve no webhook, que é onde a conta nova é desmascarada.
  --
  -- ⚠️ A CONFIRMAR NO SANDBOX: se o Asaas reaproveita o mesmo cust_... quando o
  -- mesmo CPF paga de novo por outro e-mail. Se reaproveitar, esta coluna pega
  -- conta nova sozinha; se criar cliente novo a cada checkout, ela só pega
  -- reincidência na mesma conta e quem carrega o peso é o email_hash. O código
  -- funciona nos dois casos — muda só o quanto ele alcança.
  provider_customer_id text,

  -- SHA-256 do e-mail normalizado (lower + trim). Hash e não o e-mail em claro
  -- porque a conta que originou o bloqueio pode ter sido excluída, e guardar o
  -- e-mail de quem pediu exclusão é o oposto do que a LGPD espera. Sem sal,
  -- igual ao `ip_hash` de parse_rate_limits: serve para confirmar um endereço
  -- que já se conhece, não para listar quem está bloqueado.
  email_hash           text,

  -- 'arrependimento_cdc' | 'chargeback'. Mesmo vocabulário de
  -- subscriptions.cancelled_due_to, para os dois lados contarem a mesma história.
  reason               text NOT NULL
                         CHECK (reason IN ('arrependimento_cdc', 'chargeback')),

  -- Assinatura que originou o bloqueio. SET NULL e não CASCADE: se a linha da
  -- assinatura sumir junto com a conta, o bloqueio fica — perde a referência,
  -- não o efeito.
  subscription_id      uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount_cents         integer,

  -- Liberação manual. Bloqueio não é sentença: engano acontece, e uma
  -- desistência honesta não deveria virar banimento perpétuo se a pessoa
  -- quiser voltar. Preenchido = o bloqueio não vale mais, e o histórico fica.
  released_at          timestamptz,
  released_by          uuid,
  released_note        text,

  created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.resubscribe_blocks IS
  'Quem teve estorno por arrependimento (CDC art. 49) ou chargeback e, por isso, não pode contratar de novo. Devolver o dinheiro é obrigação; vender de novo não é. Sobrevive à exclusão da conta de propósito — ver comentário de user_id.';

-- Busca por identidade: as três colunas são caminhos alternativos para a mesma
-- pessoa, e o guard tenta todas.
CREATE INDEX IF NOT EXISTS idx_resubscribe_blocks_user
  ON public.resubscribe_blocks (user_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resubscribe_blocks_customer
  ON public.resubscribe_blocks (provider_customer_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resubscribe_blocks_email
  ON public.resubscribe_blocks (email_hash) WHERE released_at IS NULL;

-- Sem grant para authenticated: nem leitura. Quem está bloqueado descobre pela
-- mensagem do checkout, que sai da server function rodando como service_role —
-- não lendo a tabela pelo PostgREST. Dar SELECT aqui entregaria a lista de
-- bloqueados (e o motivo de cada um) para qualquer sessão autenticada, que é
-- exatamente o tipo de vazamento que a regra 12 do CLAUDE.md descreve.
GRANT ALL ON public.resubscribe_blocks TO service_role;
ALTER TABLE public.resubscribe_blocks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- O que fazer quando um pagamento chega de alguém bloqueado.
--
-- No checkout dá para recusar antes do dinheiro sair. No webhook não: quando
-- PAYMENT_CONFIRMED chega para uma conta NOVA cujo cust_... já está bloqueado,
-- o dinheiro já entrou. Aí só existem duas saídas honestas, e a escolha é de
-- negócio, não de código:
--
--   'flag'   → registra, avisa o admin, e o acesso segue. Ninguém é surpreendido
--              por uma decisão automática. É o default de propósito.
--   'refund' → devolve na hora e cancela. Também é honesto (a pessoa recebe o
--              dinheiro de volta em minutos e a venda simplesmente não
--              aconteceu), mas é movimentação automática de dinheiro disparada
--              por webhook: se a lista tiver um falso positivo, o estorno sai
--              sozinho. Só ligue depois de ver 'flag' acertando na prática.
-- =============================================================================
INSERT INTO public.app_settings (key, value)
VALUES ('resubscribe_block_action', '"flag"'::jsonb)
ON CONFLICT (key) DO NOTHING;
