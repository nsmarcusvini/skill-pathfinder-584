# Plano — proteção contra abuso do direito de arrependimento

> **Status: itens 1, 2 e 3 APLICADOS em produção em 2026-09-10.** Três migrations no
> banco (`bloqueio_de_recontratacao`, `trilha_de_uso_e_cota` e a corretiva
> `corrige_grants_da_trilha_e_do_bloqueio` — ver "O erro dos grants"). Falta **deploy do
> código** e a verificação de ponta a ponta no sandbox do Asaas.
> Itens 4 e 5 são decisão de produto e estão descritos aqui sem código — ver
> "O que não foi feito, e por quê".
>
> ⚠️ Isto toca obrigação legal. O que está aqui é o **trabalho de produto e de código** que
> a proteção exige. Não substitui advogado.

## O problema

O RUMVIA cumpre o art. 49 corretamente desde 2026-09-05: dentro de 7 dias da primeira
cobrança, cancelar estorna o valor **cheio**, automaticamente, com um clique
(`docs/roadmap/conformidade-cobranca.md`, item 1). É justamente por estar certo e ser
automático que existe a brecha: dá para assinar o anual de R$ 286,80, usar a plataforma a
fundo por 6 dias — abrir centenas de vagas, clicar em todos os `apply_url`, anotar
empresas e faixas salariais — e pedir tudo de volta no dia 6.

**E, até 2026-09-10, dava para repetir isso indefinidamente.**

## O que a lei NÃO deixa fazer

Vale registrar, para ninguém gastar tempo nesses caminhos:

- **Cláusula de renúncia** ("ao usar a plataforma você abre mão do arrependimento") é
  **nula** (art. 51, I). O Brasil não tem o carve-out europeu para conteúdo digital já
  consumido (Diretiva 2011/83, art. 16(m)).
- **Reembolso proporcional ao uso dentro dos 7 dias** contraria o art. 49, que fala em
  devolução dos valores pagos. Descontar os dias usados é o que o Procon derruba.
- **Dificultar o cancelamento** é infração autônoma. O código faz certo hoje
  (autoatendimento, efeito imediato) — não regredir.

O que sobra é legítimo e é o que este plano faz: **não vender de novo**, **limitar a
extração** e **guardar prova**.

---

## 1. Bloqueio de recontratação — ✅ escrito 2026-09-10

**O buraco.** Depois do estorno o status vira `refunded`, que não está em `LIVE_STATUSES`;
`startSubscriptionCheckout` só recusava assinatura VIVA. O ciclo *assinar → usar → estornar
→ assinar de novo* não tinha fim, com o mesmo e-mail.

**A distinção que sustenta a correção.** Devolver o dinheiro é obrigação. Vender de novo
não é: ninguém é obrigado a contratar. A primeira vez é o direito sendo exercido; a segunda
é padrão de uso. O bloqueio **não retém um centavo** — só recusa a próxima venda.

Mecânica completa em `docs/PAGAMENTOS.md` → "Bloqueio de recontratação". O essencial:
`resubscribe_blocks` **sem FK para `auth.users`** (senão excluir a conta apagaria a
trava — que é a evasão mais óbvia), leitura no checkout por `user_id`/`email_hash` e no
webhook por `provider_customer_id`, e `released_at` para liberar quem merece voltar.

## 2. Trilha de uso — ✅ escrito 2026-09-10

Sem ela, "achamos que ele abusou" é palpite. Com ela é "no dia 3 abriu 180 vagas e clicou
em 140 links" — que é o que o Asaas pede numa contestação e o que um Procon quer ouvir.

Duas tabelas, com retenções diferentes e por motivos diferentes:

| Tabela | O que guarda | Vida |
|---|---|---|
| `usage_events` | detalhe: qual vaga, que hora, hash da rede | 90 dias, **cascateia com a conta** |
| `usage_daily` | agregado: quantos, por dia, por tipo | 540 dias, **sobrevive à exclusão** |

Não é contradição com a LGPD: é o art. 16, II (conservação para exercício regular de
direitos). E é o desenho que a realidade exige — o chargeback chega semanas depois, quando
a conta já não existe, e o que defende é o número por dia, não o id de cada vaga aberta.

Declarado em `/privacidade` (seção "Registro de uso da conta assinante") e exportável pelo
próprio titular em `/conta`. **Trilha não declarada vira o problema em vez de resolver um.**

Instrumentados: `listJobs`, `getJobDetail`, `recordApplyClick` (novo), `getCompanyDetail`,
`getSalaryStats`, `getToolDetail`, `getCertsCatalog`, `getCoursesCatalog`, `parseCv` (só
conta permanente — o anônimo já tem `parse_rate_limits` e não abre chargeback).

Relatório: `bun run scripts/relatorio-uso.ts --email pessoa@exemplo.com`.

## 3. Cota diária — ✅ escrita 2026-09-10

Mesmo contador da trilha (`record_usage` grava e devolve o total do dia numa ida só ao
banco). Tetos em `app_settings`, ajustáveis por UPDATE:

| Chave | Default |
|---|---|
| `usage_quota_job_detail` | 300 |
| `usage_quota_apply_click` | 150 |
| `usage_quota_job_list` | 600 |
| `usage_quota_company_detail` | 200 |
| `usage_quota_learning_catalog` | 200 |

**Os números são chute deliberadamente alto.** A cota existe para impedir que alguém baixe
a base inteira em 6 dias, não para racionar o produto: se um usuário honesto encostar no
teto, o número está errado, não o usuário. Calibre com o pico real que
`scripts/relatorio-uso.ts` imprime.

Falha **aberta**: se o registro no banco falhar, o acesso passa. A cota protege contra
abuso, e abuso não é a hipótese mais provável quando a infraestrutura está caindo.

---

## O erro dos grants — e por que ele merece uma seção

Ao aplicar, conferi `relacl` das três tabelas novas e encontrei:

```
resubscribe_blocks  anon=arwdDxtm | authenticated=arwdDxtm
usage_events        anon=arwdDxtm | authenticated=arwdDxtm
usage_daily         anon=arwdDxtm | authenticated=arwdDxtm
```

Ou seja SELECT, INSERT, UPDATE, DELETE e TRUNCATE para qualquer sessão, inclusive a
anônima. Eu tinha concedido só o que queria conceder e **assumido que não conceder
bastasse** — mas o schema `public` deste projeto tem `ALTER DEFAULT PRIVILEGES` dando tudo
a `anon` e `authenticated` em cada tabela nova. É exatamente a lição que a migration
`20260910112613` registrou para FUNÇÕES, e que eu não apliquei a TABELAS.

**Não houve exposição:** as três nasceram com RLS ligada, `resubscribe_blocks` e
`usage_events` têm zero policies (RLS sem policy nega tudo) e `usage_daily` só tem policy
de SELECT próprio. Mas era armadilha armada — bastaria alguém acrescentar um `FOR ALL`
distraído em `usage_daily` para o usuário poder zerar o próprio contador, que é editar a
prova e a cota no mesmo gesto.

Corrigido por `20260910142000_corrige_grants_da_trilha_e_do_bloqueio.sql`, revogando pelos
nomes dos papéis (`REVOKE ... FROM PUBLIC` não remove grant explícito) e devolvendo só o
`SELECT` de `usage_daily` para `authenticated`. Estado final conferido:

```
resubscribe_blocks  postgres | service_role
usage_events        postgres | service_role
usage_daily         postgres | service_role | authenticated=r
```

**A regra que sai disto:** tabela nova neste projeto **precisa** de `REVOKE ALL ... FROM
anon, authenticated` explícito. E o que prova é `relacl`/`proacl`, nunca o texto do GRANT.

## O que ainda precisa ser feito

O banco está pronto. O que falta:

1. **Deploy do código.** O schema já tem tudo, mas nada escreve na trilha nem lê o bloqueio
   até a aplicação subir. Enquanto isso, as tabelas ficam vazias — inofensivo.
2. **Conferir no sandbox se o Asaas reaproveita o `cust_...` para o mesmo CPF** com outro
   e-mail. É o que decide o alcance do caminho de webhook (ver PAGAMENTOS.md).
3. **Testar o ciclo inteiro no sandbox:** pagar → cancelar dentro dos 7 dias → confirmar
   estorno → conferir a linha em `resubscribe_blocks` → tentar assinar de novo e receber a
   recusa com o texto certo (sem o prefixo `RUMVIA_...` vazando no toast).
4. **Rodar `scripts/relatorio-uso.ts`** sobre uma conta de teste e conferir que os números
   batem com o que foi clicado. É também o primeiro teste de execução real do
   `record_usage`: o corpo dele foi validado por `EXPLAIN` (o planner resolve o
   `ON CONFLICT ... RETURNING usage_daily.count` contra `usage_daily_pkey`), mas nunca
   chegou a rodar — plpgsql só é checado sintaticamente na criação.
5. **Deixar as cotas rodarem algumas semanas em `flag`** antes de considerar
   `resubscribe_block_action = "refund"`.

---

## O que NÃO foi feito, e por quê

Os dois itens abaixo estavam no plano original. Ambos **mudam o produto**, não só o código
— e isso é decisão de quem é dono dele. Estão descritos com detalhe suficiente para serem
executados quando você decidir.

### 4. Fasear a entrega de valor

**O diagnóstico.** O RUMVIA entrega quase tudo no dia 1: gap completo, lista de vagas com
`apply_url`, faixas salariais, empresas contratando. É um produto de valor *front-loaded*
vendido como assinatura — e é isso que convida ao reembolso no dia 6. Nenhuma trava
resolve isso; só o formato do produto resolve.

**O que tornaria a assinatura genuinamente recorrente** (cada um é uma feature, não um
ajuste):

- **Alerta de vagas novas** na trilha — o valor que só existe com o tempo. Exige decisão
  sobre canal (e-mail? só `notifications`?), frequência e preferências.
- **Evolução da aderência ao longo das semanas** — `gap_analyses` já guarda
  `adherence_score` com `created_at`; falta a tela. É o item mais barato dos quatro.
- **Reanálise automática quando o CV é atualizado**, com o "o que mudou".
- **Plano de estudos com progresso semanal** — parte já existe em `study_*`.

**O argumento a favor que o mercado dá de graça:** um retrato de 6 dias apodrece. Quanto
mais o valor for "o que mudou desde a semana passada", menos sentido faz extrair e sair.

**Por que não fiz:** são features novas, com escopo de semanas, que mudam o que o produto
promete. Não é o tipo de coisa que se acrescenta de lado enquanto se fecha uma brecha.

### 5. Prévia mais completa

**A ideia.** Sem trial, a pessoa paga sem nunca ter usado a conta — e o único momento em
que descobre se o produto serve para ela é **dentro** da janela dos 7 dias. Isso empurra o
pedido de reembolso legítimo para exatamente a janela onde o abusivo também mora, e nenhuma
trilha do mundo distingue os dois com segurança. Uma prévia que deixe a pessoa entender
melhor o produto antes de pagar reduz o pedido honesto pela raiz.

**O que ela NÃO faz:** não protege nada em relação ao art. 49. Sem contrato e sem
pagamento, não há o que estornar. O efeito é sobre a **motivação**, não sobre o direito —
não confundir as duas coisas na hora de decidir.

**Por que não fiz:** a regra 12 do `CLAUDE.md` é explícita — o que roda sem assinatura é
"decisão de produto, não de código". Ampliar a prévia é literalmente dar de graça dado que
hoje é pago. É uma decisão de receita, e não é minha.

### E o trial de 7 dias?

Continua sendo a mudança que resolveria o problema pela raiz — com o contrato nascendo no
cadastro e a primeira cobrança caindo no dia 8, a janela de reflexão já correu quando o
dinheiro troca de mãos. No Asaas seria criar a assinatura com `nextDueDate` a 7 dias.

Duas ressalvas honestas: há leitura de que o prazo contaria do primeiro **pagamento**, o
que reduz muito o risco mas não o zera; e trial atrai farming, mitigável com cartão
obrigatório e um trial por CPF.

Está fora deste plano porque mexe em preço, texto, funil e checkout ao mesmo tempo — é um
plano próprio, não um item de outro.
