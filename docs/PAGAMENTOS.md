# Pagamentos — assinatura RUMVIA Pro via Asaas

Cobrança recorrente de **R$ 24,90/mês** pelo [Asaas](https://docs.asaas.com).

> **Histórico:** o roadmap original previa Stripe (Prompt 8C). Foi implementado na
> AbacatePay em 2026-08-31 e migrado para o Asaas em 2026-09-01, porque a AbacatePay
> **não faz cobrança recorrente para contas novas** — ver "Por que não AbacatePay nem
> Stripe", no fim.

---

## Como o fluxo funciona

```
usuário clica em Assinar
  └─ startSubscriptionCheckout()          src/lib/billing.functions.ts
       ├─ POST /checkouts  (chargeTypes: RECURRENT, billingTypes: CREDIT_CARD)
       │    externalReference = rumvia_<uid>_<ts>   ← o elo de volta
       └─ INSERT subscriptions (status=pending, provider_checkout_id=<uuid>)
  └─ redirect para checkout.link  (página hospedada do Asaas)

cliente paga (cartão digitado no domínio do Asaas, nunca no nosso)
  └─ POST /api/public/asaas-webhook   header: asaas-access-token
       ├─ valida o token com timingSafeEqual
       ├─ INSERT billing_events   ← UNIQUE(event_id) = idempotência
       └─ PAYMENT_CONFIRMED → subscriptions.status = active
                              current_period_end  = nextDueDate do Asaas

todo mês
  └─ PAYMENT_CONFIRMED  → empurra current_period_end
  └─ PAYMENT_OVERDUE    → past_due (ainda com acesso; o Asaas retenta)
  └─ SUBSCRIPTION_DELETED / _INACTIVATED → cancelled
```

`successUrl` volta para `/assinatura?status=sucesso`. Como o webhook leva alguns
segundos, essa tela repesca o estado a cada 3 s por ~40 s antes de desistir.

### O modelo mental que muda tudo

**A AbacatePay era orientada a assinatura; o Asaas é orientado a cobrança.**

| Família | Cobre |
|---|---|
| `SUBSCRIPTION_*` | só o ciclo de vida do contrato (criada, atualizada, cancelada) |
| `PAYMENT_*` | **o dinheiro**, correlacionado pelo campo `subscription` da cobrança |

Quem move `status` para `active` é `PAYMENT_*`, nunca `SUBSCRIPTION_CREATED`. Uma
assinatura pode existir sem nenhum pagamento confirmado.

**`PAYMENT_CONFIRMED` vs `PAYMENT_RECEIVED`:** confirmado = pago, liquidação pendente;
recebido = dinheiro disponível na conta. Liberamos o acesso no **confirmado** — segurar
até a liquidação puniria o usuário por um detalhe financeiro que não é problema dele.

### Como o pagamento acha o usuário

`external_id` (nosso) vai como `externalReference` no checkout e volta nos webhooks. O
handler tenta, nesta ordem:

1. `externalReference` do payment ou da subscription → `external_id`
2. `payment.subscription` (sub_…) → `provider_subscription_id`
3. **busca a assinatura na API** para ler o `externalReference` dela
4. `customer` → `provider_customer_id`, entre as assinaturas vivas

O passo 3 existe porque nem todo payload traz o `externalReference`. Sem ele o pagamento
fica órfão e o usuário paga sem liberar acesso — vale a chamada extra à API.

---

## O que foi criado

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260831120210_abacatepay_assinaturas.sql` | `billing_plans`, `subscriptions`, `billing_events`, `has_active_subscription()` |
| `supabase/migrations/20260831120220_paywall_acesso_pago.sql` | `can_access_paid_features()` = pagante OU admin |
| `supabase/migrations/20260831120415_restringe_rpcs_assinatura_a_auth_uid.sql` | As RPCs só respondem para o próprio `auth.uid()` ou `service_role` |
| `supabase/migrations/20260901160000_billing_agnostico_de_fornecedor.sql` | `abacate_*` → `provider_*` + coluna `provider` |
| `src/lib/asaas/types.ts` | Tipos v3 + conversão centavos↔reais |
| `src/lib/asaas/client.server.ts` | **Único** ponto que fala com a API do Asaas |
| `src/lib/asaas/webhook.server.ts` | Token, idempotência, efeito dos eventos |
| `src/routes/api/public/asaas-webhook.ts` | Rota HTTP fina |
| `src/lib/billing.functions.ts` | `getBillingOverview`, `startSubscriptionCheckout`, `cancelMySubscription` |
| `src/integrations/supabase/subscription-middleware.ts` | `requireActiveSubscription` — trava server-side |
| `src/hooks/use-subscription.tsx` | `useSubscription()`, `useStartCheckout()`, `useCancelSubscription()` |
| `src/components/rumvia/paywall.tsx` | `<Paywall>`, `<PaywallCard>`, `formatCents()` |
| `src/lib/plan-copy.ts` | Texto do plano em um lugar só |
| `src/routes/_conta/assinatura.tsx` | Tela de plano, status, recibo e cancelamento |
| `scripts/asaas-setup.ts` | Valida a conta e cadastra o webhook |

### Duas armadilhas de unidade e de shell

**Centavos vs reais.** O banco guarda `price_cents` (2490); o Asaas quer reais (24.90).
A conversão vive só em `reaisFromCents`/`centsFromReais` (`src/lib/asaas/types.ts`).
Nunca dividir por 100 solto — é assim que nasce cobrança de R$ 2.490,00.

**O `$` da API key.** A chave começa com `$aact_`. No `.env` ela **precisa** de aspas
duplas com o `$` escapado:

```
ASAAS_API_KEY="\$aact_hmlg_..."
```

Testado: o bun expande `$` como variável **mesmo entre aspas simples**, e a chave chega
vazia — falha silenciosa que parece "chave inválida".

**Na hospedagem (Vercel/Netlify) é o oposto:** cole o valor **CRU**, começando com
`$aact_`, **sem aspas e sem a barra de escape**. Copiar do `.env` (onde está como
`"\$aact_..."`) leva a chave escapada para o painel e a API devolve
`401 — A chave de API fornecida é inválida`, mensagem que não diz nada sobre o
caractere a mais. Aconteceu de verdade em 2026-09-01.

Por isso `client.server.ts` tem `normalizeKey()`: remove aspas em volta, barra
invertida inicial e espaços, e repõe o `$` se faltar — **avisando no log**, para
destravar sem esconder o erro de configuração. Verificado com as cinco variantes
(correta, sem `$`, com `\`, com aspas, com espaços): todas autenticam.

### Preço é dado, não código

`billing_plans` guarda preço, ciclo e métodos. Mudar de R$ 24,90 é `UPDATE billing_plans`
— e no Asaas nem há catálogo a recriar, porque o preço vai direto no checkout
(`provider_plan_ref` fica NULL de propósito).

---

## Setup (uma vez por ambiente)

Sandbox e produção têm chaves e webhooks **separados**. A chave de sandbox contém `_hmlg_`.

### 1. Variáveis de ambiente

```
ASAAS_API_KEY="\$aact_..."     # Asaas → Integrações → API
ASAAS_WEBHOOK_TOKEN=            # você inventa; 32+ caracteres, nunca a API key
APP_BASE_URL=https://…          # origem pública HTTPS, sem barra no fim
```

Em produção, defina como variável de ambiente da hospedagem — nunca em arquivo (regra 8).
**Na Vercel, adicionar variável não reinicia nada:** é preciso um novo deploy
(Deployments → Redeploy) para ela passar a valer.

### 2. Aplicar as migrations

Já aplicadas no projeto remoto (`hskvwzkouhkwumzshbci`). Em ambiente novo:
`supabase db push`.

### 3. Cadastrar o webhook

```bash
bun run scripts/asaas-setup.ts
```

Valida a chave, mostra o status de aprovação da conta e cadastra o webhook em
`$APP_BASE_URL/api/public/asaas-webhook`. Rodar de novo não duplica.

**O endpoint precisa ser HTTPS público.** Para dev, use um túnel
(`cloudflared tunnel --url http://localhost:8080`) e ponha a URL em `APP_BASE_URL`.

⚠️ **Use o domínio canônico, `https://www.rumvia.com.br`.** O apex (`rumvia.com.br`)
devolve **308** para o `www` na Vercel, e webhook é POST — cliente que não segue redirect
falha, e quem segue pode perder o corpo. Registrado em produção:
`5f5bfa12-2ff0-4aac-959a-eb9400389063`.

---

## Testar

Com a chave de sandbox, o checkout aceita cartão de teste e os webhooks chegam com
`dev_mode: true`. A tela `/assinatura` marca essas assinaturas com o selo `sandbox`.

Segurança do webhook, sem tocar no Asaas:

```bash
curl -i -X POST "https://rumvia.com.br/api/public/asaas-webhook" -d '{}'
# → 401 asaas-access-token inválido

curl -i -X POST "https://rumvia.com.br/api/public/asaas-webhook" \
  -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" -d '{"id":"evt_x","event":"PING"}'
# → 200 (evento desconhecido é registrado e ignorado)
```

Todo evento fica em `billing_events` com o payload cru, `handled` e `handle_error` — é por
ali que se investiga cobrança que "não caiu". O Asaas também tem log próprio em
**Integrações → Logs de Webhooks**.

⚠️ O Asaas **interrompe a fila após 15 falhas consecutivas**. Se o endpoint ficar quebrado,
reative o webhook no painel depois de corrigir — o script avisa quando detecta
`interrupted`.

---

## O funil: onde o paywall entra

```
/                landing — prévia grátis + seção #planos com o preço
/analise         prévia do CV, sessão anônima, sem cadastro
/cadastro        cria a conta (converte a sessão anônima, mesmo user.id)
/assinatura      ⟵ redirect obrigatório após o cadastro
   checkout hospedado do Asaas (mesma aba)
/assinatura?status=sucesso  → repesca o webhook e segue para:
/onboarding → /dashboard
```

Quem entra em qualquer rota de `_conta` sem assinatura cai em `/assinatura?bloqueado=1`.
O guard está na rota de destino, não no botão.

**Duas rotas abrem sem pagar:** `/assinatura` (é onde se paga) e `/conta` (exportar e
excluir dados é direito LGPD, não benefício de plano). **Admin entra sem pagar** —
`can_access_paid_features` = `has_active_subscription OR is_admin`.

### Por que redirect e não popup

O checkout é página hospedada: o cartão é digitado no domínio do Asaas. Popup custa
bloqueador, perda do callback e um fluxo que não sobrevive a F5.

---

## Travar uma feature no plano pago

Duas camadas, **as duas obrigatórias**:

```tsx
<Paywall description="Salários por senioridade é um recurso do Pro.">
  <TabelaDeSalarios />
</Paywall>
```

```ts
export const getSalaryStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .handler(async ({ context }) => { ... });
```

Esconder o botão não protege: sem o middleware, qualquer um chama a server function
direto. Hoje o paywall é de **conta inteira** (`_conta/*` e `/onboarding`), não por
feature.

---

## Limites e decisões

- **Só cartão de crédito.** PIX Automático exige que o recebedor seja **pessoa jurídica**
  — regra do Banco Central, não política de fornecedor. O RUMVIA é pessoa física.
- **Sessão anônima não assina.** A assinatura precisa sobreviver à troca de dispositivo.
- **`past_due` ainda conta como pagante** enquanto o Asaas retenta. Cortar no primeiro
  vencimento gera mais churn que fraude evitada.
- **Chargeback corta o acesso na hora.** Reativar é decisão manual.
- **Uma assinatura viva por usuário**, garantido por índice único parcial.
- **Não pedimos CPF.** A página hospedada coleta nome, e-mail e CPF — um dado sensível a
  menos sob nossa guarda.

## Quando houver CNPJ (6+ meses)

Habilitar PIX Automático no painel do Asaas e rodar
`UPDATE billing_plans SET methods = ARRAY['CARD','PIX']`. O `billingTypes` do checkout
passa a incluir PIX. **Zero mudança de arquitetura** — foi o motivo de escolher Asaas em
vez de Stripe.

---

## Por que não AbacatePay nem Stripe

**AbacatePay** (suporte, 2026-09-01): *"não possui essa funcionalidade disponível para
novas integrações. O cartão de crédito foi descontinuado para novas contas... O PIX
automático também está indisponível no momento e sem previsão de retorno."*

Comprovado por teste antes da resposta chegar: `/subscriptions/create` recusava CARD e
PIX, **mas cobrança avulsa funcionava** na mesma loja — o que isolou o problema em
capacidade de recorrência, não em erro de integração.

**Stripe:** a doc é explícita — *"As contas Stripe no Brasil podem aceitar pagamentos
únicos via Pix... O Pix Automático **não está disponível no Brasil**."* Cartão recorrente
funciona, mas o caminho para PIX ficaria fechado para sempre. O Asaas mantém esse caminho
aberto para o dia em que existir CNPJ.
