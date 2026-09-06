# Plano — conformidade da cobrança recorrente

> **Status: EXECUTADO em 2026-09-05, com uma pendência.** Itens 1 (arrependimento), 4
> (blindagem do PIX) e a parte de relatório do item 3 estão prontos e verificados contra
> o sandbox real do Asaas. Item 2 (Termos) está estruturalmente pronto, mas a seção de
> identificação do fornecedor depende de dados pessoais que só o usuário pode fornecer
> (`src/lib/legal-copy.ts`, `FORNECEDOR`) — a página mostra isso como pendência visível
> em vez de inventar. Emissão de nota fiscal (resto do item 3) segue não implementada:
> depende de decisão externa (contador). Detalhes de implementação em `docs/PAGAMENTOS.md`
> e no runbook de progresso, `docs/PROGRESS.md`.
>
> ⚠️ Os itens 1, 2 e 3 tocam obrigação legal e tributária. O que está aqui é o
> **trabalho de produto e de código** que cada obrigação exige, mais as perguntas que
> precisam de advogado ou contador. Não substitui nenhum dos dois.

Resumo do que foi verificado no código, antes de qualquer plano — e o que mudou depois:

| Frente | Situação em 2026-09-03 | Situação em 2026-09-05 |
|---|---|---|
| Arrependimento (7 dias) | ❌ Não existe. `cancelMySubscription` cancela sem devolver dinheiro. | ✅ Estorna dentro de 7 dias da primeira cobrança (testado no sandbox, valor integral). |
| Termos de uso | ❌ Não existe página. Links do rodapé eram `href="#"`. | ⚠️ Página e registro de aceite prontos; falta identificação real do fornecedor. |
| Nota fiscal | ❌ Cliente só recebe recibo de transação, que não é nota fiscal. | ⚠️ Relatório de faturamento pronto; emissão de nota segue não implementada. |
| Só cartão | ✅ Correto nos dados (`methods = ['CARD']`), sem blindagem contra erro futuro. | ✅ `startSubscriptionCheckout` recusa PIX em qualquer plano recorrente, com motivo. |

---

## 1. Direito de arrependimento (CDC art. 49) — ✅ executado 2026-09-05

**A lei.** Sete dias corridos para desistir de compra feita fora do estabelecimento, e
os valores pagos voltam **integralmente e de imediato** — não é reembolso proporcional,
é devolução do que foi pago. Prazo conta da contratação.

**Onde quebra hoje.** Duas coisas, e a segunda é pior que a primeira:

1. `src/routes/_conta/assinatura.tsx` diz, na caixa de cancelamento: *"o cancelamento é
   imediato e irreversível: não há reembolso proporcional"*. Correto do 8º dia em
   diante; dentro dos 7, contradiz o CDC no próprio texto que o usuário lê antes de
   clicar.
2. `cancelMySubscription` (`src/lib/billing.functions.ts`) chama
   `asaas.cancelSubscription` e grava `status = 'cancelled'`. **Nunca estorna.** O
   `client.server.ts` nem tem método de estorno — hoje um pedido de arrependimento só
   se resolve à mão, pelo painel do Asaas, por alguém que lembre de fazer isso.

O webhook, por outro lado, **já sabe receber** um estorno: `PAYMENT_REFUNDED` grava
`status = 'refunded'` e `cancelled_due_to = 'refunded'` (`webhook.server.ts`). Metade do
caminho está pronta — falta o lado que pede.

### Passos

1. **Achar a cobrança a estornar.** `subscriptions` guarda `provider_subscription_id`,
   mas **não** o `pay_...`. Duas saídas: `asaas.listPaymentsBySubscription()` na hora,
   ou uma coluna `provider_payment_id` aprendida no webhook (o `payment.id` já chega em
   todo `PAYMENT_*`). Prefira a coluna: o webhook já monta um `patch`, é um campo a
   mais, e evita depender de uma chamada externa no momento do cancelamento.
2. **`asaas.refundPayment(paymentId)`** em `src/lib/asaas/client.server.ts` —
   `POST /payments/{id}/refund`, único ponto que fala com a API deles (não abrir
   exceção a essa regra). Confirmar no sandbox se o Asaas retém alguma taxa no estorno:
   se retiver, quem absorve é o RUMVIA, porque o consumidor tem direito ao valor cheio.
3. **Janela calculada no servidor, nunca no cliente.** `getBillingOverview` passa a
   devolver `withdrawalDeadline` (7 dias corridos a partir do primeiro
   `PAYMENT_CONFIRMED` — na prática `current_period_start` do primeiro ciclo). O front
   só exibe; se quem decide for o browser, a data vira parâmetro de quem quiser
   editá-la.
4. **`cancelMySubscription` ganha dois caminhos.** Dentro da janela: estorna **e**
   cancela, com `cancelled_due_to = 'arrependimento_cdc'`. Fora: o comportamento de
   hoje. O status final dentro da janela é `refunded`, e quem confirma é o webhook —
   a server function só pede. Manter idempotente: pedir estorno de cobrança já
   estornada não pode virar erro para o usuário.
5. **Texto, em quatro lugares e antes do clique:** a caixa de cancelamento passa a ter
   duas versões conforme a janela; a seção `#planos` da landing; a página de termos
   (item 2); e o momento anterior ao checkout. A frase precisa dizer *sete dias* e
   *devolução integral* — "cancele quando quiser" não cumpre o dever de informar.
6. **Verificar no sandbox:** pagar, estornar pela nova função, conferir que
   `PAYMENT_REFUNDED` chega, que `status` vira `refunded`, que `canAccess` cai para
   `false` e que `billing_events.handled` fica `true`.

### Decisão que é sua, não do código

- **O acesso termina na hora do arrependimento?** Devolvendo o valor cheio, sim — é o
  desfazimento do contrato. Coerente com o cancelamento comum, que já corta na hora.
- **Renovação também dá 7 dias?** O art. 49 fala da contratação, não de cada cobrança
  do mesmo contrato. Este plano assume **primeiro pagamento**. A proteção da renovação é
  outra: poder cancelar antes de a próxima cobrança sair — e isso já funciona. Vale
  confirmar com advogado, e é justamente o tipo de item onde o anual pesa mais (R$
  286,80 de uma vez).

---

## 2. Termos de uso e política de cancelamento — ⚠️ estrutura pronta, fornecedor pendente

**O achado.** Não é que o conteúdo esteja incompleto — **não existe página**. O rodapé
tem dois links mortos (`href="#"`, em `src/routes/index.tsx:699` e `:735`) e o cadastro
não pede aceite de nada. Um contrato de assinatura recorrente vendido a consumidor, sem
termo publicado e sem registro de aceite, é o buraco mais barato de fechar desta lista
e o mais constrangedor de deixar aberto.

### Passos

1. **Criar `src/routes/termos.tsx`**, espelhando `privacidade.tsx` (mesmo
   `PublicHeader` + `PageHeader` + `Blueprint` com `<section>` por assunto). Apontar os
   dois links do rodapé para lá.
2. **Cobrir, no mínimo:**
   - **Quem é o fornecedor** — identificação e canal de contato. O CDC exige; e isso
     esbarra numa decisão sua (ver abaixo).
   - **O que o serviço é e o que não é** — análise estatística de aderência a vagas
     reais. Não é promessa de emprego, nem consultoria de carreira, nem garantia de
     resultado. Essa frase evita a reclamação mais provável.
   - **Preço, ciclo e renovação automática** — que a cobrança **se repete sozinha** até
     o cancelamento, e em qual ciclo. Preço vem de `billing_plans` como em toda tela
     (regra 12): a página lê a mesma fonte, não escreve número no JSX.
   - **Como cancelar** — autoatendimento em `/assinatura`, efeito imediato, sem
     reembolso proporcional depois dos 7 dias.
   - **Direito de arrependimento** — item 1. Os dois textos precisam nascer juntos.
   - **Reajuste** — hoje quem já assina continua no preço contratado, porque
     `amount_cents` é copiado no checkout. Isso já é verdade; dizer é ganho de
     confiança de graça.
   - **Inadimplência** — `past_due` mantém o acesso enquanto o Asaas retenta;
     chargeback corta na hora.
   - **Dados** — remissão a `/privacidade`, sem duplicar (dois textos sobre o mesmo
     assunto divergem no primeiro update).
   - **Disponibilidade e responsabilidade** — sem promessa de SLA que o produto não tem.
   - **Lei aplicável e foro** — o consumidor processa no domicílio dele; cláusula que
     tente prender o foro é nula e ainda pega mal.
3. **Registrar o aceite.** Página publicada não prova aceite. Checkbox explícito no
   `/cadastro` (e/ou antes do checkout) + gravação de **quando** e **de qual versão**.
   Sugestão: tabela `terms_acceptances` (`user_id`, `version`, `accepted_at`) em vez de
   coluna em `profiles` — quando o texto mudar, o histórico é o que vale.
4. **Versionar de verdade.** `privacidade.tsx` hoje diz *"Última atualização: 2026."*,
   que não é data. Ambas as páginas precisam de versão + data exata, e é essa versão
   que vai para `terms_acceptances`.

### Limite honesto

Consigo estruturar a página e escrever com precisão **o que o sistema faz** — ciclos,
renovação, cancelamento, retentativa, reajuste, retenção de dados —, porque isso está no
código e eu verifiquei. A redação final de um contrato de consumo é trabalho de
advogado, e a parte mais sensível é justamente a que o código não conhece: qual
identificação do fornecedor vai publicada (nome e CPF, enquanto for pessoa física) e o
que isso expõe. Decida isso antes de eu escrever o texto.

---

## 3. Nota fiscal e tributação — ⚠️ relatório pronto, emissão não implementada

**Onde estamos.** O cliente recebe `last_receipt_url` — comprovante de transação do
Asaas. Não é nota fiscal. Nenhum código do RUMVIA emite, agenda ou consulta nota.

**O que o gateway oferece.** O Asaas emite NFS-e por conta própria, inclusive de forma
recorrente: `POST /subscriptions/{id}/invoiceSettings` configura a emissão automática a
cada cobrança da assinatura, e existe `POST /invoices` + `/invoices/{id}/authorize` para
o caso avulso. Ou seja, **a emissão não precisa virar código nosso** — precisa de
cadastro fiscal correto no Asaas e de um dado que hoje nós deliberadamente não temos.

### A tensão que precisa ser decidida antes de tudo

`docs/PAGAMENTOS.md` registra, como decisão consciente: *"Não pedimos CPF. A página
hospedada coleta nome, e-mail e CPF — um dado sensível a menos sob nossa guarda."*
Emitir nota fiscal exige o CPF/CNPJ do tomador e, dependendo do município, endereço.

Isso **não** significa desfazer a decisão. A pergunta certa é: o Asaas já coletou esse
dado no checkout dele — dá para a emissão sair de lá, com o dado que já está lá, sem
nunca trafegar pelo RUMVIA? Se sim, a decisão original sobrevive intacta e o trabalho é
de configuração, não de mudança de funil. Confirmar isso é o **primeiro passo**, porque
a resposta muda todo o resto do plano.

### Passos

1. **Confirmar a origem do dado do tomador** (acima). Se o Asaas usa o cadastro do
   próprio cliente, nada muda no nosso funil.
2. **Configurar o cadastro fiscal no Asaas** (`fiscalInfo`) — regime, município,
   serviço, alíquota de ISS. Nada disso é palpite meu: sai do contador.
3. **Ligar a emissão automática por assinatura** via `invoiceSettings`, uma vez por
   assinatura criada. Se for esse o caminho, vira uma chamada em
   `startSubscriptionCheckout` ou no webhook de `SUBSCRIPTION_CREATED`.
4. **Expor a nota ao cliente** em `/assinatura`, ao lado do recibo que já aparece.
   `GET /subscriptions/{id}/invoices` lista as notas do contrato.
5. **Relatório para o contador** — receita por mês, bruta e líquida (a taxa do Asaas
   entra aqui), com estornos e chargebacks separados. O dado já existe entre
   `subscriptions` e `billing_events`; falta uma tela em `admin.*` ou um script que
   exporte. Isso vale ser feito **mesmo antes** de resolver a emissão: sem ele, a
   conversa com o contador começa sem números.

### Perguntas que são do contador, não minhas

Não vou opinar sobre tratamento tributário — só listo o que a decisão precisa cobrir:

- Receita recorrente recebida como **pessoa física**: como se declara, e o que muda com
  o volume.
- A partir de que ponto abrir CNPJ (ou MEI) sai mais barato que continuar PF.
- ISS: município, alíquota, se há retenção.
- Quando a emissão de nota passa a ser obrigatória, e o custo de emitir retroativo.

**Um argumento de cronograma que o código sustenta:** o CNPJ já aparece no roadmap por
outro motivo — PIX Automático exige recebedor PJ (item 4 e `docs/PAGAMENTOS.md`), com
carência de 6+ meses de atividade no Asaas. Se a conversa fiscal apontar para abrir CNPJ
de qualquer forma, os dois problemas se resolvem com a mesma decisão, e a carência de 6
meses recompensa começar cedo.

---

## 4. Só cartão — manter honesto e blindar o gatilho — ✅ executado 2026-09-05

**Já está certo.** Os três planos gravam `methods = ['CARD']` (conferido no banco), e o
motivo está documentado: PIX Automático exige recebedor PJ por regra do Banco Central, e
o checkout `RECURRENT` do Asaas recusa qualquer `billingTypes` com PIX. Não é limitação
que dê para contornar escolhendo outro fornecedor.

Este item não é dívida — é **impedir que vire uma**.

### Passos

1. **Blindar o dia em que alguém ligar PIX cedo demais.** `docs/PAGAMENTOS.md` ensina
   que o gatilho para o futuro é
   `UPDATE billing_plans SET methods = ARRAY['CARD','PIX']`. Rodado **antes** do CNPJ,
   isso quebra o checkout de todo mundo: `startSubscriptionCheckout` traduz `methods`
   direto em `billingTypes` e o Asaas devolve 400. O CHECK da tabela não pode salvar
   (não conhece o tipo da conta), então a proteção é em duas camadas baratas:
   - `startSubscriptionCheckout` recusa PIX em plano recorrente com erro que **diz o
     motivo**, em vez de repassar o 400 do gateway;
   - `scripts/asaas-setup.ts` já imprime quando a conta é `personType: FISICA` e já
     valida o ciclo de cada plano — ligar as duas coisas e avisar quando um plano
     recorrente listar PIX numa conta PF.
2. **Dizer antes do clique, não depois.** Hoje a landing (`cartão de crédito · renova
   sozinho`), o FAQ e `/assinatura` já falam em cartão. Vale reler junto com o texto do
   item 2, para o termo não prometer meio de pagamento que não existe.
3. **Não perder de vista o custo.** Cartão-só exclui uma fatia real do mercado
   brasileiro. `docs/PAGAMENTOS.md` já registra que **PIX avulso funciona nesta conta**
   (`chargeTypes: ["DETACHED"]` devolve 200 com chave PIX cadastrada) e que a renovação
   manual por PIX ficou como decisão de produto em aberto — exige fluxo de lembrete
   antes do vencimento e tem retenção pior. Com o plano **anual** no catálogo, essa
   conta muda: um PIX por ano é muito menos atrito que um por mês, e o valor cheio
   (R$ 286,80) é o que mais sofre com a exclusão de quem não tem cartão de crédito com
   limite. Vale reavaliar — mas como experimento medido, não como suposição.

---

## Ordem sugerida — e o que de fato aconteceu em 2026-09-05

A execução seguiu o que não dependia de dado externo primeiro, e deixou por último só o
que depende de decisão de terceiro:

1. ✅ **Arrependimento** (item 1) — código completo, testado no sandbox contra um
   pagamento real (estorno de R$ 286,80, confirmado imediato).
2. ✅ **Relatório de faturamento** (parte do item 3) — `scripts/relatorio-faturamento.ts`,
   rodado contra o sandbox real.
3. ✅ **Blindagem do PIX** (item 4) — guard em `startSubscriptionCheckout` +
   aviso em `asaas-setup.ts`.
4. ⚠️ **Termos de uso** (item 2) — página, tabela de aceite e checkbox no cadastro
   prontos; falta só a identificação real do fornecedor (`src/lib/legal-copy.ts`), que é
   dado pessoal e não pode ser inventado.
5. ⏸ **Emissão de nota** (resto do item 3) — não iniciada. Depende de decisão externa
   (contador, e possivelmente CNPJ) antes de fazer sentido escrever código.
