# Pagamentos — assinatura RUMVIA Pro via Asaas

Cobrança recorrente pelo [Asaas](https://docs.asaas.com), em três ciclos:

| Plano (`billing_plans.key`) | Ciclo Asaas | Cobrado | Equivalente mensal | Desconto |
|---|---|---|---|---|
| `pro_mensal` | `MONTHLY` | R$ 29,90 / mês | R$ 29,90 | — |
| `pro_trimestral` | `QUARTERLY` | R$ 80,70 / trimestre | R$ 26,90 | −10% |
| `pro_anual` | `YEARLY` | R$ 286,80 / ano | R$ 23,90 | −20% |

O acesso é **idêntico** nos três — o ciclo só muda de quanto em quanto tempo a
cobrança sai e quanto isso barateia o mês. O desconto não está gravado em lugar
nenhum: sai de `price_cents / months` contra o maior equivalente mensal do
catálogo (`toPlans` em `billing.functions.ts`).

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

> ⚠️ **O `externalReference` NÃO sobrevive ao checkout hospedado.** O valor que
> mandamos no corpo do `POST /checkouts` fica só na sessão de checkout: a assinatura
> (`sub_…`) e as cobranças (`pay_…`) que ela gera nascem com `externalReference: null`.
> Verificado em 2026-09-01 com payload real de `PAYMENT_CONFIRMED`.
> **O elo que de fato chega é o `checkoutSession`** — o uuid que o `POST /checkouts`
> devolveu e que guardamos em `provider_checkout_id`.

O handler tenta, nesta ordem:

1. `externalReference` do payment ou da subscription → `external_id`
2. **`checkoutSession` do payment ou da subscription → `provider_checkout_id`** ← o que funciona
3. `payment.subscription` (sub_…) → `provider_subscription_id`
4. **busca a assinatura na API** para ler o `externalReference` dela
5. `customer` → `provider_customer_id`, entre as assinaturas vivas

O passo 1 fica porque é o elo mais explícito e pode voltar a vir (cobrança avulsa, ou se
o Asaas passar a propagar). O passo 3 só funciona a partir do segundo evento: o `sub_…` é
aprendido no primeiro, junto com o `customer` e o método.

Sem o passo 2 **todo pagamento fica órfão**: o dinheiro entra no Asaas, o webhook chega e é
gravado, e a assinatura local segue `pending` para sempre — o usuário paga e continua
bloqueado. Foi exatamente o que aconteceu no primeiro pagamento real de sandbox.

`billing_events.handled` reflete se o evento **mudou alguma coisa**. Evento que chega e não
correlaciona fica `handled=false` com o motivo em `handle_error` — antes era marcado como
tratado e a falha passava silenciosa.

### Reparar assinatura presa

O webhook não é retroativo: um evento já consumido pela idempotência não volta (reenviar
devolve `duplicate`). Para reconciliar o banco com a verdade do Asaas:

```bash
bun run scripts/asaas-reconcile.ts          # mostra o que faria
bun run scripts/asaas-reconcile.ts --apply  # grava
```

Ele varre as assinaturas locais em `pending`/`past_due`, acha a correspondente no Asaas pelo
`checkoutSession`, e ativa as que já têm cobrança `CONFIRMED`/`RECEIVED`. Idempotente: rodar
duas vezes não muda nada. Serve também para webhook perdido (fila interrompida após 15
falhas, deploy fora do ar, domínio trocado).

---

## Direito de arrependimento (CDC art. 49)

Sete dias corridos a partir da **primeira** cobrança confirmada — nunca da mais recente —
para desistir com **devolução integral**, nunca proporcional. Implementado em
2026-09-05 (`docs/roadmap/conformidade-cobranca.md`, item 1).

```
subscriptions.first_activated_at  ← gravado UMA VEZ, no primeiro PAYMENT_CONFIRMED/RECEIVED
                                     (webhook.server.ts). Nunca sobrescrito em renovação —
                                     é por isso que existe separado de current_period_start,
                                     que É sobrescrito a cada ciclo.
subscriptions.provider_payment_id ← pay_... aprendido em QUALQUER webhook PAYMENT_*, para
                                     achar a cobrança a estornar sem consultar a API na hora.
```

`getBillingOverview` devolve `subscription.withdrawalDeadline` (calculado no servidor —
o front só exibe, nunca decide). `cancelMySubscription` recalcula a janela por conta
própria a cada chamada; dentro dela, o cancelamento também chama
`asaas.refundPayment(paymentId)` **antes** de cancelar a assinatura no Asaas, e grava
`cancelled_due_to = 'arrependimento_cdc'` em vez de `'cancelled_by_user'`. O status final
`refunded` é gravado pelo webhook (`PAYMENT_REFUNDED`), não pela server function — mesmo
padrão do cancelamento comum, que também não antecipa o que o Asaas vai confirmar depois.

**Estorno de cartão é imediato no Asaas.** Testado no sandbox em 2026-09-05:
`POST /payments/{id}/refund` devolve `status: "REFUNDED"` na hora, sem espera — diferente
de PIX, que teria fluxo próprio. Um segundo pedido de estorno na mesma cobrança devolve
`400 — "Não é possível cancelar a venda."`; `cancelMySubscription` trata esse erro
especificamente como sucesso (idempotência), porque o dinheiro já voltou e um duplo clique
não pode virar erro para o usuário.

Sem `provider_payment_id` gravado (dado antigo, ou correlação que não chegou ainda),
`cancelMySubscription` cai para `asaas.listPaymentsBySubscription()` antes de desistir — o
direito não pode depender de um campo estar preenchido.

---

## O que foi criado

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260831120210_abacatepay_assinaturas.sql` | `billing_plans`, `subscriptions`, `billing_events`, `has_active_subscription()` |
| `supabase/migrations/20260831120220_paywall_acesso_pago.sql` | `can_access_paid_features()` = pagante OU admin |
| `supabase/migrations/20260831120415_restringe_rpcs_assinatura_a_auth_uid.sql` | As RPCs só respondem para o próprio `auth.uid()` ou `service_role` |
| `supabase/migrations/20260901160000_billing_agnostico_de_fornecedor.sql` | `abacate_*` → `provider_*` + coluna `provider` |
| `supabase/migrations/20260903160021_planos_mensal_trimestral_anual.sql` | três ciclos, `months` (gerada), `sort_order`, CHECK do ciclo no vocabulário do Asaas |
| `src/lib/asaas/types.ts` | Tipos v3 + conversão centavos↔reais |
| `src/lib/asaas/client.server.ts` | **Único** ponto que fala com a API do Asaas |
| `src/lib/asaas/webhook.server.ts` | Token, idempotência, efeito dos eventos |
| `src/routes/api/public/asaas-webhook.ts` | Rota HTTP fina |
| `src/lib/billing.functions.ts` | `getBillingOverview`, `getPublicPlans`, `startSubscriptionCheckout(planKey)`, `cancelMySubscription` |
| `scripts/asaas-reconcile.ts` | Repara assinatura presa (webhook perdido ou órfão) |
| `scripts/relatorio-faturamento.ts` | Faturamento por mês a partir de `billing_events` — base numérica para o contador |
| `src/routes/termos.tsx` | Termos de uso — versão + identificação do fornecedor (✅ preenchida em `src/lib/legal-copy.ts`; a página cai num EmptyState se algum campo for esvaziado) |
| `src/lib/legal-copy.ts` | Identificação do fornecedor e versão dos Termos, em um lugar só |
| `supabase/migrations/20260905155813_conformidade_arrependimento_e_termos.sql` | `first_activated_at`, `provider_payment_id`, `terms_acceptances` |
| `src/integrations/supabase/subscription-middleware.ts` | `requireActiveSubscription` — trava server-side |
| `src/hooks/use-subscription.tsx` | `useSubscription()`, `useStartCheckout()`, `useCancelSubscription()` |
| `src/components/rumvia/paywall.tsx` | `<Paywall>`, `<PaywallCard>`, `formatCents()` |
| `src/lib/plan-copy.ts` | Texto do plano e tradução dos ciclos, em um lugar só |
| `src/routes/_conta/assinatura.tsx` | Escolha do ciclo, status, recibo e cancelamento |
| `scripts/asaas-setup.ts` | Valida a conta e cadastra o webhook |

### Duas armadilhas de unidade e de shell

**Centavos vs reais.** O banco guarda `price_cents` (2990); o Asaas quer reais (29.90).
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

### Preço é dado, não código — e ciclo também

`billing_plans` guarda preço, ciclo e métodos, **uma linha por ciclo**. Mudar de preço
é `UPDATE billing_plans`; criar um ciclo novo (semestral, por exemplo) é um `INSERT`
com `sort_order`. Nos dois casos: zero deploy. No Asaas nem há catálogo a recriar,
porque o preço vai direto no checkout (`provider_plan_ref` fica NULL de propósito).

**Duas armadilhas ao mexer nisso:**

1. **`cycle` vai CRU para o Asaas.** O valor de `billing_plans.cycle` é copiado tal e
   qual para `subscription.cycle` no `POST /checkouts`. O ciclo anual lá chama-se
   `YEARLY`, não `ANNUALLY` — o CHECK antigo da tabela aceitava `ANNUALLY`, que a API
   recusaria. Hoje o CHECK é exatamente o vocabulário deles, restrito aos ciclos que
   são múltiplos inteiros de mês: `MONTHLY`, `BIMONTHLY`, `QUARTERLY`, `SEMIANNUALLY`,
   `YEARLY`. Os três em uso foram testados contra o sandbox em 2026-09-03: os três
   devolvem 200 com o ciclo e o valor corretos.
2. **`months` é coluna GERADA**, derivada do ciclo. Não tente escrever nela — e não
   crie uma coluna de "desconto": ela viraria uma segunda verdade que envelhece
   sozinha no dia em que alguém alterar só o `price_cents`.

**Quem já paga não é afetado por mudança de preço.** `subscriptions.amount_cents` é
copiado no momento do checkout, então o valor cobrado e exibido continua sendo o
contratado. Grandfathering sem coluna nenhuma — conferido depois do reajuste de
2026-09-03: as assinaturas antigas seguem em 2490.

**Não há troca de ciclo automática.** Para migrar de mensal para anual, a pessoa
cancela e assina de novo; a cobrança já feita não é rateada, e a tela diz isso. Se um
checkout `pending` existir para OUTRO plano, `startSubscriptionCheckout` descarta o link
antigo e abre um novo — reaproveitar cobraria o preço errado.

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

- **Só cartão de crédito na assinatura.** Testado no sandbox em 2026-09-01: o checkout
  hospedado recusa qualquer `billingTypes` com PIX quando `chargeTypes` é `RECURRENT` —
  *"CREDIT_CARD é o único método de pagamento permitido para operações RECURRENT"*. E o
  PIX Automático (via separada, para recorrência de verdade) exige recebedor **pessoa
  jurídica**, regra do Banco Central. O RUMVIA é pessoa física.

- **PIX avulso: IMPLEMENTADO em 2026-09-08** (era "decisão de produto em aberto" até
  aqui). `chargeTypes: ["DETACHED"]` + `billingTypes: ["PIX"]`, no mesmo checkout
  hospedado do cartão — então o Asaas continua coletando os dados do cliente e o RUMVIA
  segue sem tocar em CPF. Mesmo gateway, mesmo webhook, mesmo schema.

  **É pré-pago, não assinatura:** cada pagamento compra UM período e não renova. Quando
  `current_period_end` passa, o acesso cai sozinho (quem decide é
  `has_active_subscription`, comparando a data). O cron `rumvia-expira-avisa-pix`
  (diário, 9h) avisa 3 dias antes e marca a linha vencida como `expired` — este é o
  "fluxo de lembrete" que faltava, e é o que torna o pré-pago defensável apesar da
  retenção pior.

  ⚠️ **PRÉ-REQUISITO OPERACIONAL: a conta precisa de uma CHAVE PIX cadastrada.** Sem ela
  o Asaas recusa com *"Para gerar cobranças com Pix é necessário criar uma chave Pix no
  Asaas"*. **Sandbox e produção são contas separadas: a chave criada em homologação NÃO
  vale em produção** — crie de novo em Asaas → PIX → Minhas chaves antes de anunciar PIX
  aos clientes. `startSubscriptionCheckout` traduz esse erro para uma mensagem que o
  cliente entende ("use cartão") e registra o diagnóstico real no log do servidor.
- **Sessão anônima não assina.** A assinatura precisa sobreviver à troca de dispositivo.
- **`past_due` ainda conta como pagante** enquanto o Asaas retenta. Cortar no primeiro
  vencimento gera mais churn que fraude evitada.
- **Chargeback corta o acesso na hora.** Reativar é decisão manual.
- **Uma assinatura viva por usuário**, garantido por índice único parcial.
- **Não pedimos CPF.** A página hospedada coleta nome, e-mail e CPF — um dado sensível a
  menos sob nossa guarda.

## Quando houver CNPJ (6+ meses)

⚠️ **Não confunda com o PIX que já existe.** `methods = ARRAY['CARD','PIX']` já está
ligado nos três planos e é o que habilita o **PIX avulso** (pré-pago, DETACHED). Rodar
esse UPDATE de novo não traz PIX Automático.

PIX Automático é **outra API** — `/v3/pix/automatic/*`, com modelo de autorização +
instrução de cobrança por ciclo, nada a ver com `POST /checkouts`. Habilitar exige, nesta
ordem:

1. CNPJ com 6+ meses de atividade (regra do Asaas) — e recebedor PJ é regra do Banco
   Central para PIX Automático, não do gateway.
2. Pedir a habilitação ao suporte do Asaas para a conta.
3. **Implementar o fluxo novo**: `POST /v3/pix/automatic/authorizations`, as instruções
   de pagamento por ciclo, as retentativas, e os eventos `PIX_AUTOMATIC_RECURRING_*` no
   webhook. Isso é projeto, não ajuste de configuração.

O que continua verdade é o motivo de ter escolhido o Asaas: o caminho existe. A Stripe
fecha essa porta para sempre em conta BR.

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
