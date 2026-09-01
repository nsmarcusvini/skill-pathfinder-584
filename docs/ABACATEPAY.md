# AbacatePay — assinatura RUMVIA Pro

Cobrança recorrente de **R$ 24,90/mês** pela [AbacatePay](https://docs.abacatepay.com).
Substituiu o Stripe que estava no roadmap (Prompt 8C).

---

## Como o fluxo funciona

A AbacatePay tem um detalhe que muda o desenho inteiro: **`POST /subscriptions/create`
não cria uma assinatura — cria um _checkout_ de assinatura.** A assinatura (`subs_…`) só
passa a existir depois que o cliente paga. Por isso guardamos o `bill_…` na hora e o
`subs_…` só quando o webhook chega.

```
usuário clica em Assinar
  └─ startSubscriptionCheckout()            src/lib/billing.functions.ts
       ├─ POST /customers/create            (idempotente por CPF/CNPJ)
       ├─ POST /subscriptions/create        → { id: bill_…, url }
       └─ INSERT subscriptions (status=pending, external_id=rumvia_<uid>_<ts>)
  └─ redirect para checkout.url

cliente paga na AbacatePay
  └─ POST /api/public/abacatepay-webhook?webhookSecret=…
       ├─ valida secret (query) + HMAC (header X-Webhook-Signature)
       ├─ INSERT billing_events  ← UNIQUE(event_id) = idempotência
       └─ subscription.completed → subscriptions.status = active
                                    current_period_end  = agora + 1 ciclo

todo mês
  └─ subscription.renewed   → empurra current_period_end
  └─ subscription.cancelled → status = cancelled
       cancelledDueTo = "max_payment_retries_exceeded" quando o cartão falhou
       maxRetry vezes (padrão: 3 tentativas, 3 dias entre elas)
```

`completionUrl` volta para `/assinatura?status=sucesso`. Como o webhook leva alguns
segundos, essa tela repesca o estado a cada 3 s por ~40 s antes de desistir.

---

## O que foi criado

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260831120210_abacatepay_assinaturas.sql` | `billing_plans`, `subscriptions`, `billing_events`, `has_active_subscription()` |
| `supabase/migrations/20260831120220_paywall_acesso_pago.sql` | `can_access_paid_features()` = pagante OU admin |
| `supabase/migrations/20260831120415_restringe_rpcs_assinatura_a_auth_uid.sql` | Fecha enumeração: as duas RPCs acima só respondem para o próprio `auth.uid()` ou `service_role` |
| `src/lib/plan-copy.ts` | Texto do plano em um lugar só (landing + `/assinatura`) |
| `src/components/auth/protected-route.tsx` | Portões: conta → assinatura → onboarding |
| `src/lib/abacatepay/types.ts` | Tipos da API v2 (sem segredo, importável do client) |
| `src/lib/abacatepay/client.server.ts` | **Único** ponto que fala com `api.abacatepay.com` |
| `src/lib/abacatepay/webhook.server.ts` | Validação (secret + HMAC), idempotência, efeito dos eventos |
| `src/routes/api/public/abacatepay-webhook.ts` | Rota HTTP fina |
| `src/lib/billing.functions.ts` | `getBillingOverview`, `startSubscriptionCheckout`, `cancelMySubscription` |
| `src/integrations/supabase/subscription-middleware.ts` | `requireActiveSubscription` — trava server-side |
| `src/hooks/use-subscription.tsx` | `useSubscription()`, `useStartCheckout()`, `useCancelSubscription()` |
| `src/components/rumvia/paywall.tsx` | `<Paywall>`, `<PaywallCard>`, `formatCents()` |
| `src/routes/_conta/assinatura.tsx` | Tela de plano, status, recibo e cancelamento |
| `scripts/abacatepay-setup.ts` | Cria produto + webhook na AbacatePay (idempotente) |

### Preço é dado, não código

`billing_plans` guarda preço, ciclo, métodos, trial e política de retentativa. Mudar de
R$ 24,90 para outro valor é `UPDATE billing_plans` **+ recriar o produto na AbacatePay**
(o preço fica no produto lá também) — nunca editar arquivo `.tsx`.

Um único lugar responde "essa pessoa é pagante?": `public.has_active_subscription(uid)` no
banco, `getBillingOverview().isPro` no servidor, `useSubscription().isPro` no front.

---

## Setup (uma vez por ambiente)

Sandbox e produção têm chaves, produtos e webhooks **separados**. A chave de sandbox
começa com `abc_dev_`.

### 1. Variáveis de ambiente

```
ABACATE_PAY_API_KEY=            # AbacatePay → Integrar → API Keys
ABACATE_PAY_WEBHOOK_SECRET=     # você inventa; 32 bytes hex serve
APP_BASE_URL=https://…          # origem pública HTTPS, sem barra no fim
```

Em produção, defina como variável de ambiente da hospedagem — nunca em arquivo (regra 8).

### 2. Aplicar a migration

**Já aplicado no projeto remoto** (`hskvwzkouhkwumzshbci`) em 2026-08-31, via MCP do
Supabase. Se estiver clonando para outro projeto/ambiente:

```bash
supabase db push
```

Ou aplique as três migrations pelo painel, na ordem: `20260831120210_abacatepay_assinaturas.sql`,
`20260831120220_paywall_acesso_pago.sql`, `20260831120415_restringe_rpcs_assinatura_a_auth_uid.sql`.

> A terceira existe porque a primeira rodada dos advisors de segurança, logo após aplicar
> as duas primeiras, apontou `has_active_subscription`/`can_access_paid_features` como
> chamáveis por `authenticated` com `_user_id` arbitrário — qualquer sessão logada podia
> descobrir se OUTRO usuário paga. Corrigido com `auth.uid() = _user_id OR auth.role() =
> 'service_role'` dentro das funções; verificado com `SET LOCAL ROLE authenticated` que a
> checagem cruzada devolve `false` mesmo para um admin real que paga de verdade.

### 3. Criar produto e webhook na AbacatePay

```bash
bun run scripts/abacatepay-setup.ts
```

O script cria o produto `rumvia-pro_mensal` (R$ 24,90, ciclo `MONTHLY`), grava o `prod_…`
em `billing_plans.abacate_product_id` e cadastra o webhook apontando para
`$APP_BASE_URL/api/public/abacatepay-webhook?webhookSecret=…`. Rodar de novo não duplica
nada.

**O endpoint precisa ser HTTPS público** — a AbacatePay recusa localhost e IP privado.
Para testar local, exponha o app com um túnel:

```bash
cloudflared tunnel --url http://localhost:8080
```

e ponha a URL do túnel em `APP_BASE_URL` antes de rodar o script.

---

## Testar

Com a chave de sandbox (`abc_dev_…`), o checkout aceita pagamento simulado e os webhooks
chegam com `devMode: true`. A tela `/assinatura` marca essas assinaturas com o selo
`sandbox`.

Para conferir só as camadas de segurança do webhook, sem tocar na AbacatePay:

```bash
curl -i -X POST "http://localhost:8080/api/public/abacatepay-webhook" -d '{}'
# → 401 webhookSecret inválido

curl -i -X POST "http://localhost:8080/api/public/abacatepay-webhook?webhookSecret=$ABACATE_PAY_WEBHOOK_SECRET" -d '{}'
# → 401 assinatura HMAC inválida
```

O HMAC é `base64(HMAC-SHA256(corpo_cru, chave_pública_da_abacatepay))`. A chave pública
está publicada na doc e vive em `webhook.server.ts` — não é segredo e não vai no `.env`.

Todo evento recebido fica em `billing_events` com o payload cru, `handled` e
`handle_error`. É por ali que se investiga cobrança que "não caiu".

---

## O funil: onde o paywall entra

```
/                landing — prévia grátis + seção #planos com o preço
/analise         prévia do CV, sessão anônima, sem cadastro
/cadastro        cria a conta (converte a sessão anônima, mesmo user.id)
/assinatura      ⟵ redirect obrigatório após o cadastro. Faixa vermelha
                   "Sua conta está bloqueada" enquanto não houver pagamento
   checkout AbacatePay (página hospedada, mesma aba)
/assinatura?status=sucesso  → repesca o webhook e segue sozinho para:
/onboarding      trilha, senioridade, segmento
/dashboard       painel liberado
```

Quem tenta entrar direto em qualquer rota de `_conta` sem assinatura cai em
`/assinatura?bloqueado=1`. Quem faz login sem assinatura idem — o guard está na
rota de destino, não no botão, então link direto, botão Voltar e aba salva
passam pelo mesmo portão.

**Duas rotas abrem sem pagar**, e por motivos diferentes:

- `/assinatura` — é onde se paga; exigir pagamento para chegar nela seria um laço.
- `/conta` — guarda exportar e excluir os dados. Trancar alguém para fora do
  próprio direito de apagar a conta contraria a LGPD. O dado é da pessoa,
  pagando ou não.

**Admin entra sem pagar.** `can_access_paid_features(uid)` é
`has_active_subscription(uid) OR is_admin(uid)` — senão o dono do produto se
tranca para fora do próprio painel.

### Por que redirect e não popup

O checkout da AbacatePay é página hospedada: o cartão é digitado no domínio
deles, não no nosso. Abrir isso em popup custa bloqueio de popup, perda do
`completionUrl` e um fluxo que não sobrevive a F5 nem a link compartilhado.
O paywall é uma tela real (`/assinatura`), com URL própria e estado no banco.

### Onde o aviso aparece

`AVISO_ACESSO_PAGO`, em `src/lib/plan-copy.ts`, é a frase única — repetida de
propósito na landing (seção de planos e CTA final), no card de upsell de
`/analise`, no formulário de `/cadastro` (antes do clique, não depois) e na
tela `/assinatura`. Mudar a frase em um lugar muda em todos.

## Travar uma feature no plano pago

Duas camadas, e **as duas são obrigatórias**:

```tsx
// front — UX
import { Paywall } from "@/components/rumvia";

<Paywall description="Salários por senioridade é um recurso do Pro.">
  <TabelaDeSalarios />
</Paywall>;
```

```ts
// servidor — segurança de verdade
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/integrations/supabase/subscription-middleware";

export const getSalaryStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .handler(async ({ context }) => { ... });
```

Esconder o botão não protege nada: sem o middleware, qualquer um chama a server function
direto. Quando o middleware barra, ele lança `PAYWALL_ERROR` (`"RUMVIA_PRO_REQUIRED"`) —
mensagem estável para o front redirecionar para `/assinatura`.

Para RLS de tabela paga, use a mesma fonte:

```sql
USING (auth.uid() = user_id AND public.has_active_subscription(auth.uid()))
```

**Hoje o paywall é de conta inteira**, não por feature: `_conta/*` (exceto
`/assinatura` e `/conta`) e `/onboarding` exigem assinatura, via
`ProtectedRoute requireSubscription`. `<Paywall>` e `requireActiveSubscription`
continuam disponíveis para quando fizer sentido liberar parte do produto e
cobrar só por um pedaço.

---

## ⚠️ Bloqueador: a loja precisa ter método recorrente habilitado

**Assinatura não é capacidade padrão da loja AbacatePay.** Testado em 2026-08-31 na loja
`store_Ywj6PCcNKfyrqK35AUfnSuFc` (sandbox), `POST /subscriptions/create` devolve 400 para
os dois métodos:

| Endpoint | Produto | `methods` | Resposta |
|---|---|---|---|
| `/subscriptions/create` | com `cycle` | `["CARD"]` | ❌ `400 CARD is not available for this store` |
| `/subscriptions/create` | com `cycle` | `["PIX"]` | ❌ `400 PIX Automático is not available` |
| `/subscriptions/create` | com `cycle` | `["PIX","CARD"]` | ❌ `400 PIX Automático is not available` |
| `/checkouts/create` | **com** `cycle` | `["PIX"]` | ❌ `400 PIX Automático is not available` |
| `/checkouts/create` | **sem** `cycle` | `["PIX"]` | ✅ `200` — `bill_…`, `frequency: ONE_TIME` |
| `/transparents/create` | — | PIX | ✅ `200` — QR code gerado |

As duas últimas linhas são a prova: **a mesma loja cobra normalmente**, desde que a
cobrança não seja recorrente. Basta o produto ter `cycle` definido para a AbacatePay
exigir PIX Automático — mesmo num checkout avulso.

O produto do RUMVIA está correto (`RUMVIA Pro`, 2490, `cycle: MONTHLY`, `ACTIVE`,
`externalId: rumvia-pro_mensal`). Não falta produto nem configuração nossa: falta
**capacidade de cobrança recorrente na conta**, que a AbacatePay libera.

**Ação:** falar com o suporte da AbacatePay e pedir habilitação de cobrança recorrente
(cartão e/ou PIX Automático) para a loja. Sem isso o checkout de assinatura não abre, em
sandbox nem em produção.

Depois de liberado, o ajuste é só dado — `UPDATE billing_plans SET methods = ...` — porque
o método de pagamento nunca foi hardcoded (regra 1).

## Limites e decisões

- **Sessão anônima não assina.** `startSubscriptionCheckout` recusa `is_anonymous` — a
  assinatura precisa sobreviver à troca de dispositivo (regra 7).
- **Cancelamento é imediato e irreversível.** A AbacatePay não tem carência nem reembolso
  proporcional: o acesso Pro termina na hora do clique. A tela avisa e pede confirmação
  digitada.
- **Uma assinatura viva por usuário**, garantido por índice único parcial
  (`status IN ('pending','active','past_due')`). Canceladas e expiradas ficam como
  histórico.
- **Retentativa:** 3 tentativas com 3 dias de intervalo (`billing_plans.max_retry` /
  `retry_every_days`). Esgotadas, a AbacatePay cancela sozinha e manda
  `subscription.cancelled` com `cancelledDueTo: "max_payment_retries_exceeded"`.
- **Chargeback (`checkout.disputed` / `checkout.lost`) corta o acesso na hora.** Reativar
  é decisão manual.
- **`past_due` ainda conta como pagante.** Enquanto as retentativas rolam, o acesso
  continua — cortar no primeiro boleto falho gera mais churn que fraude.

## MCP da AbacatePay

A [doc](https://docs.abacatepay.com/pages/ai/mcp) oferece um MCP server (local via `bun`,
ou remoto em `https://mcp.abacatepay.com/mcp`) com ferramentas `v2CreateProduct`,
`v2CreateSubscription`, `v2ListCustomers` etc. Ele é útil para **operar a loja
conversando** — conferir assinaturas, criar cupom, olhar MRR. Não faz parte do runtime: o
app fala com `api.abacatepay.com` por HTTP, e o `scripts/abacatepay-setup.ts` cobre o
setup de forma reproduzível.
