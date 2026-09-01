# Plano — migrar cobrança de AbacatePay para Asaas

> **Status: EXECUTADO em 2026-09-01.** O plano foi seguido; o runbook do estado
> final vive em `docs/PAGAMENTOS.md`. Este arquivo fica como registro da decisão.
>
> Dois riscos aqui listados foram resolvidos na implementação: `endDate` é opcional
> (confirmado no sandbox) e não há catálogo de produtos a criar no Asaas.

## Por que migrar

A AbacatePay **não faz cobrança recorrente para contas novas** (resposta do suporte em
2026-09-01, transcrita em `docs/PAGAMENTOS.md`): cartão foi descontinuado para contas
novas e PIX Automático está indisponível sem previsão. Não é configuração pendente — a
funcionalidade não existe para nós.

Toda a integração construída em 2026-08-31 (produto, webhook, checkout) está correta e
funcionando; ela simplesmente bate numa parede de capacidade do fornecedor.

### Por que Asaas e não Stripe

Ambos resolvem assinatura no cartão. O desempate é o futuro do PIX:

| | Cartão recorrente | PIX Automático |
|---|---|---|
| **Asaas** | ✅ aceita CPF/MEI/CNPJ | ✅ quando houver CNPJ ativo há 6+ meses |
| **Stripe (conta BR)** | ✅ | ❌ indisponível para conta BR, ponto final |

O RUMVIA hoje é **pessoa física**, então PIX recorrente está fora — não por escolha de
fornecedor, mas por **regra do Banco Central**: no PIX Automático o recebedor precisa ser
PJ. Nenhum provedor pode contornar isso.

A diferença é o dia em que existir um CNPJ com 6 meses: no Asaas basta habilitar o PIX
Automático, **mesmo fornecedor, sem nova migração**. Com Stripe, cartão seria permanente.

---

## O que muda e o que fica

O fornecedor foi isolado desde o início. A migração é cirúrgica:

### Trocar (~650 linhas)

| Arquivo | Destino |
|---|---|
| `src/lib/abacatepay/client.server.ts` | `src/lib/asaas/client.server.ts` |
| `src/lib/abacatepay/webhook.server.ts` | `src/lib/asaas/webhook.server.ts` |
| `src/lib/abacatepay/types.ts` | `src/lib/asaas/types.ts` |
| `src/routes/api/public/abacatepay-webhook.ts` | `.../asaas-webhook.ts` |
| `scripts/abacatepay-setup.ts` | `scripts/asaas-setup.ts` |

### Fica intacto

Schema (`billing_plans`, `subscriptions`, `billing_events`), `has_active_subscription()`,
`can_access_paid_features()`, `ProtectedRoute` + guards, `requireActiveSubscription`,
`useSubscription`, `<Paywall>`, seção de planos da landing, tela `/assinatura`, todo o
funil e a máquina de status.

### Renomear (migration)

As 4 colunas `abacate_*` viram agnósticas, para nunca mais amarrar o schema a um
fornecedor:

```sql
ALTER TABLE public.subscriptions RENAME COLUMN abacate_customer_id     TO provider_customer_id;
ALTER TABLE public.subscriptions RENAME COLUMN abacate_bill_id         TO provider_checkout_id;
ALTER TABLE public.subscriptions RENAME COLUMN abacate_subscription_id TO provider_subscription_id;
ALTER TABLE public.billing_plans RENAME COLUMN abacate_product_id      TO provider_plan_ref;
ALTER TABLE public.subscriptions ADD COLUMN provider text NOT NULL DEFAULT 'asaas';
```

`subscriptions` e `billing_events` estão vazias (nenhum pagamento real aconteceu), então
o rename é seguro — não há dado para migrar.

---

## Mapeamento AbacatePay → Asaas

A diferença conceitual que mais afeta o código: **a AbacatePay é orientada a assinatura,
o Asaas é orientado a cobrança.** No Asaas, `SUBSCRIPTION_*` só cobre o ciclo de vida do
contrato; quem diz que entrou dinheiro é `PAYMENT_*`, correlacionado pelo campo
`subscription` da cobrança.

| Conceito | AbacatePay | Asaas |
|---|---|---|
| Abrir checkout | `POST /subscriptions/create` | `POST /checkouts` com `chargeTypes: ["RECURRENT"]`, `billingTypes: ["CREDIT_CARD"]` |
| Primeiro pagamento | `subscription.completed` | `PAYMENT_CONFIRMED` (ou `PAYMENT_RECEIVED`) com campo `subscription` |
| Renovação | `subscription.renewed` | `PAYMENT_CONFIRMED` da cobrança seguinte |
| Falha de cobrança | retry interno + `subscription.cancelled` | `PAYMENT_OVERDUE` |
| Cancelamento | `subscription.cancelled` | `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED` |
| Autenticação do webhook | secret na query + HMAC-SHA256 | header `asaas-access-token` |
| Idempotência | `log_...` | `evt_...` (mesmo padrão, `billing_events.event_id` UNIQUE serve) |

### Consequência para `webhook.server.ts`

O handler passa a ter duas famílias de evento:

- `PAYMENT_*` → move `subscriptions.status` e `current_period_end` (é o dinheiro)
- `SUBSCRIPTION_*` → move ciclo de vida (cancelamento, inativação)

`PAYMENT_CONFIRMED` vs `PAYMENT_RECEIVED`: **confirmado** = pago, dinheiro ainda não
liberado; **recebido** = dinheiro disponível. Para liberar acesso, `PAYMENT_CONFIRMED`
basta e é mais rápido — segurar o acesso até `RECEIVED` puniria o usuário por um detalhe
de liquidação.

### Segurança do webhook

Some o HMAC (o Asaas não assina o corpo), fica o header `asaas-access-token`. Requisitos
do token: 32–255 caracteres, sem espaços, **nunca a API key**. Vira
`ASAAS_WEBHOOK_TOKEN` no `.env` — mesmo papel do `ABACATE_PAY_WEBHOOK_SECRET` atual.

Comparação honesta: é uma camada a menos que a AbacatePay (que tinha secret + HMAC).
Continua adequado — o token é secreto, vai por HTTPS e a comparação deve usar
`timingSafeEqual`, como já fazemos.

Entrega é **at least once** e a fila para após **15 falhas consecutivas** — reforça manter
a resposta HTTP 200 rápida e o processamento idempotente, que já é o desenho atual.

---

## Passos

### Você (fora do que consigo fazer)

1. Criar conta no Asaas (aceita CPF) e passar pela aprovação cadastral
2. Gerar API key de **Sandbox** — `Integrações → API`
3. Definir um `ASAAS_WEBHOOK_TOKEN` (32+ caracteres aleatórios)
4. Conferir as **taxas** de cartão e o prazo de repasse — não verifiquei, e isso afeta a
   margem de um produto de R$ 24,90

### Eu

5. `src/lib/asaas/` — client REST (customers, checkouts, subscriptions), tipos, handler
   de webhook com as duas famílias de evento
6. Rota `src/routes/api/public/asaas-webhook.ts` (fina, como a atual)
7. Migration de rename das colunas + `provider`
8. `scripts/asaas-setup.ts` — cadastra o webhook e valida a conta
9. Ajustar `billing.functions.ts` (3 pontos de chamada) e as 3 frases de copy em
   `/assinatura`
10. **Deletar** `src/lib/abacatepay/`, a rota e o script antigos
11. Renomear `docs/ABACATEPAY.md` para `docs/PAGAMENTOS.md` e atualizar CLAUDE.md e PROGRESS.md

### Testar (sandbox)

12. Cadastro → `/assinatura` → checkout hospedado → cartão de teste do Asaas
13. Conferir `subscriptions.status = active` e `current_period_end` corretos
14. Simular `PAYMENT_OVERDUE` e cancelamento
15. Repetir os testes de segurança do webhook (token errado → 401)

---

## Riscos e pontos em aberto

- **Taxas não verificadas.** Não checei o custo por transação no cartão. Num ticket de
  R$ 24,90 a taxa pesa proporcionalmente mais — vale confirmar antes de commitar.
- **`endDate` do checkout recorrente.** A doc do Asaas cita `cycle`, `nextDueDate` e
  `endDate` no objeto `subscription`. Para assinatura sem prazo, precisa confirmar se
  `endDate` é opcional ou se aceita data distante. Resolver na implementação.
- **Política de retentativa (dunning).** A AbacatePay tinha `retryPolicy` explícito na
  API; no Asaas isso parece ser configuração de conta. Verificar onde se define e refletir
  em `billing_plans.max_retry` / `retry_every_days` (ou remover essas colunas se o Asaas
  não expuser).
- **Aprovação cadastral.** Conta nova passa por análise. Se o Asaas recusar o segmento,
  o plano B é Stripe com cartão (mesma arquitetura, só o client muda de novo).
- **Cartão-apenas continua sendo a limitação de produto.** Para o público do RUMVIA
  (profissionais de tecnologia) é aceitável, mas é uma parcela de mercado que fica de fora
  até existir CNPJ.

## Quando houver CNPJ (6+ meses)

Habilitar PIX Automático no painel do Asaas e rodar
`UPDATE billing_plans SET methods = ARRAY['CARD','PIX']`. O `billingTypes` do checkout
passa a incluir `PIX`. **Zero mudança de arquitetura** — é o motivo de ter escolhido Asaas
em vez de Stripe.
