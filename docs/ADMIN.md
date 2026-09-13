# Painel administrativo do RUMVIA

Área interna em `/admin`. Dez abas (as do array `TABS` em `src/routes/_conta/admin.tsx`), todas restritas a `profiles.is_admin = true`.

## Como o acesso funciona

São duas camadas, e só a segunda protege de verdade:

1. **Navegação** — o item "Admin" só aparece no menu de quem é admin, e a rota `/admin`
   mostra "Acesso restrito" para os demais. Isso é conveniência, não segurança.
2. **Servidor** — toda função em `admin.functions.ts` chama `assertAdmin()` antes de
   qualquer coisa, verificando `profiles.is_admin` do usuário do token. É aqui que o
   acesso é de fato barrado: mesmo chamando a API direto, sem admin não passa.

### O primeiro admin

Não há como se autopromover pela interface — seria um furo. Existem duas formas
de nascer o primeiro administrador:

**Automática (bootstrap).** Um gatilho em `auth.users` promove um e-mail
específico **enquanto não existir nenhum admin**. Assim que houver um, o gatilho
para de agir: é uma semente que germina uma vez, não uma porta dos fundos.

Ele só promove quando todas as condições valem: o e-mail confere com o guardado
no Vault (`rumvia_bootstrap_admin_email`), a conta não é anônima, o e-mail está
confirmado, e não há nenhum admin. O gatilho cobre tanto cadastro direto quanto
a conversão de sessão anônima em conta permanente, que é o caminho principal do
RUMVIA.

O e-mail fica no Vault, e não em `app_settings`, porque aquela tabela é legível
por qualquer usuário autenticado — guardar ali revelaria quem administra a
instância. Para trocar o alvo:

```sql
select vault.create_secret('novo@email.com', 'rumvia_bootstrap_admin_email',
                           'E-mail promovido a admin enquanto nao houver nenhum');
```

**Manual.** Sempre possível, direto no SQL:

```sql
update public.profiles p
set is_admin = true
from auth.users u
where u.id = p.id and u.email = 'seu-email@exemplo.com';
```

Depois do primeiro, todos os outros saem pela tela **Usuários**.

Duas travas impedem que a operação fique sem ninguém no comando:

- Você não consegue remover o próprio acesso de admin — outro admin precisa fazer isso.
- Conta anônima não pode virar admin: ela não tem login para recuperar depois.

---

## As telas

### Visão geral — `/admin`

Índice com um card por área. Nada acontece aqui além de navegação.

### Usuários — `/admin/usuarios`

Quem usa o RUMVIA e o que cada um já produziu.

**Você vê:** e-mail, nome, trilha, senioridade, data de criação, último acesso, e quantas
análises de gap, planos de estudo e certificações a pessoa tem. Contadores no topo separam
contas permanentes de anônimas e mostram quantos admins existem.

**Você faz:**
- **Tornar admin / Remover admin** — grava em `profiles.is_admin`.
- **Desativar / Reativar conta** — usa o ban do GoTrue (`ban_duration`). Desativar bloqueia
  o login sem apagar nada; reativar devolve o acesso. Nenhum dado é perdido.
- Filtrar por permanentes, anônimos, admins ou desativados, e buscar por e-mail ou nome.

> Contas anônimas são visitantes que enviaram currículo sem se cadastrar. O cron
> `rumvia-purge-anon` as apaga após 7 dias sem acesso — é a retenção prometida em
> `/privacidade`.

### Clientes — `/admin/clientes`

Quem abriu checkout, o que pagou de fato e se está usando o que pagou. É a tela de
retenção; `/admin/usuarios` é a de conta.

**Você vê, na lista:** nome, e-mail, status da assinatura, plano, ciclo, forma de pagamento,
trilha e senioridade; **há quanto tempo é cliente** (de `first_activated_at` — quem só abriu
o checkout aparece como "checkout aberto há X", porque chamar de cliente quem nunca pagou
seria mentira); **quanto já pagou** (cobranças confirmadas e não estornadas, não o valor
contratado); e o **uso dos últimos 30 dias** — sparkline por dia, total de eventos, dias
ativos, quando foi o último uso e os dois tipos de evento mais frequentes.

**Indicadores do topo:** clientes com acesso, receita mensal equivalente (cada ciclo dividido
pelos seus meses — é o único jeito de somar mensal, trimestral e anual num número só, e não
é caixa), total recebido (isso sim é caixa) e **"pagando e sem usar"**.

**Cobranças órfãs.** Quando existe `billing_events` de dinheiro com `subscription_id IS NULL`,
um bloco vermelho abre a tela. Significa que o `findSubscription` do webhook não ligou o
pagamento a nenhuma assinatura local — o valor não entra no total de nenhum cliente e, se a
cobrança não foi estornada, **há alguém que pagou e está sem acesso**. Investigue pelo
`cus_...` no painel do Asaas.

**Você faz:** buscar por e-mail, nome, plano ou trilha; filtrar por com acesso, pagando e sem
usar, cobrança falhou, cancelamento agendado, aguardando pagamento, encerrados ou todos (cada
chip mostra a contagem); ordenar por mais recentes, maior receita, quem mais usa, quem mais
sumiu ou renovação mais próxima; e abrir uma linha para o dossiê completo.

**O dossiê** (gaveta lateral, carregado sob demanda) traz: identificação e perfil; uso de 90
dias com contagem por tipo de evento e os últimos 25 eventos um a um; o que a pessoa construiu
no produto (currículos, análises e último score, skills, plano de estudos com itens concluídos,
horas registradas, certificações, cursos, empresas seguidas); o histórico de assinaturas com
cada cobrança e link para o recibo do Asaas; conta e conformidade (criação, último login,
onboarding, tour, versão dos termos aceita); e bloqueios de reassinatura, se houver.

> **"Pagando e sem usar"** é quem tem acesso e passou 14 dias sem nenhum evento registrado,
> ou nunca usou depois de 7 dias de assinatura. Login não conta como uso — quem abre e fecha
> não recebeu valor. Sandbox (`dev_mode`) e admin ficam fora da conta: um não é dinheiro, o
> outro não cancela. As assinaturas de teste também saem de todos os indicadores por padrão,
> com um botão para trazê-las de volta.

> O uso vem de `usage_daily`, o mesmo agregado guardado como prova de entrega numa contestação
> de cobrança (`docs/SEGURANCA.md`). `usage_events` é o detalhe e é expurgado pela retenção —
> por isso o dossiê avisa que os eventos listados são rastro recente, não histórico.

### Salários — `/admin/salarios`

Moderação das contribuições de salário. Qualquer conta permanente pode contribuir,
mas o dado entra como **pendente** e só influencia a mediana depois de aprovado.

O motivo: `mv_salary_stats` mistura salário de vaga e de usuário no mesmo percentil.
Uma contribuição errada desloca a mediana da trilha — e a mediana é exatamente o
número que as pessoas usam para negociar.

**Você vê:** faixa, moeda, período, trilha, senioridade e segmento; de onde veio
(título da vaga, ou e-mail de quem contribuiu); e a mediana do grupo comparável
(mesma trilha + senioridade + segmento + moeda), com o tamanho da amostra.
Contribuições que fogem mais de 2,5× para cima ou ficam abaixo de 0,4× da mediana
aparecem destacadas — o filtro **Só discrepantes** isola essas.

Valores em hora, mês e ano são convertidos para mensal antes de comparar, senão
um salário anual pareceria absurdo ao lado de um mensal.

**Você faz:**
- **Aprovar** ou **Rejeitar** uma contribuição.
- **Corrigir** valores, moeda, período, trilha, senioridade e segmento. Corrigir
  não aprova — são ações separadas de propósito, para você poder ajustar e ainda
  decidir depois.
- **Excluir** spam.
- **Recalcular estatísticas** ao terminar a revisão: aprovar não atualiza a
  mediana na hora, o refresh das materialized views é explícito.

Observações vindas de vaga (`source='posting'`) nascem aprovadas — têm origem
rastreável, com o payload bruto em `job_posting_raw`. Só contribuição de usuário
passa por aqui.

> Regras aplicadas no banco, não só na tela: usuário não consegue inserir com
> status diferente de `pendente`, nem gravar como se fosse `source='posting'`,
> nem contribuir com conta anônima. Ver
> `20260827150000_salary_moderation.sql`.

### Fontes — `/admin/fontes`

Origem das vagas. São 14 fontes cadastradas: ATS públicos (Greenhouse, Lever, Ashby,
Workable, SmartRecruiters, Recruitee), agregadores de remoto (Remotive, RemoteOK,
Himalayas, Jobicy, Arbeitnow), CSV manual e duas pagas desativadas (Adzuna, JSearch).

**Você vê:** status e horário da última execução, quantas vagas cada fonte trouxe, quantas
seguem ativas, e a mensagem de erro quando falha.

**Você faz:**
- **Rodar ingestão agora** — para todas as fontes ou só uma.
- **Ativar/desativar** uma fonte sem apagá-la.
- **Emitir token de webhook** para fontes *push*: um sistema externo passa a mandar vagas
  para `/api/public/ingest-webhook`. O token aparece **uma única vez** — só o hash fica no
  banco.

### Importar CSV — `/admin/importar`

Cobre vagas brasileiras que nenhuma API gratuita entrega. Cole ou suba o CSV, veja a
validação linha a linha e confirme. Limite de 500 vagas por importação; linhas inválidas
são rejeitadas e contabilizadas separadamente.

### Curadoria de skills — `/admin/skills`

O extrator é determinístico: dicionário e regex, sem IA. Quando encontra um termo técnico
que não conhece, ele não adivinha — enfileira em `pending_skill_terms`.

**Você vê:** os termos que apareceram em vagas suficientes para valerem atenção, com
quantas vagas distintas, um trecho de exemplo e a skill que o sistema suspeita ser
equivalente.

**Você faz:**
- **Aprovar** — vira alias de uma skill existente ou skill nova. O extrator passa a
  reconhecer o termo daí em diante.
- **Rejeitar** — vai para a blocklist e não volta a ser sugerido.
- **Rodar extração** manualmente nas vagas ainda não processadas.

É aqui que a qualidade do gap melhora com o tempo. Sem curadoria, o dicionário congela.

### Trilhas — `/admin/trilhas`

Trilha é dado, não código: criar uma não exige deploy.

**Você faz:** criar e editar trilhas (chave, nome), gerenciar as variantes de cargo que o
matcher usa para classificar vagas, e ativar/desativar uma trilha inteira. A `key` é
imutável depois de criada — ela aparece em seeds e consultas.

Faltam ainda os `track_skill_baselines` (importância e nível exigido por skill e
senioridade), que hoje entram por SQL. O passo a passo está em `ADICIONAR_TRILHA.md`.

### Saúde — `/admin/saude`

Doze métricas, atualizando a cada 60 segundos: usuários (total, permanentes, anônimos,
novos em 7 dias), vagas (total, ativas, BR, remoto global), análises de gap, planos de
estudo, tamanho da fila de curadoria, e quando as materialized views e o cron rodaram pela
última vez.

Serve para responder rápido "o dado está velho?". Se as views estiverem atrasadas, rode a
ingestão em Fontes ou espere o próximo ciclo do `pg_cron`.

### Descobrir ATS — `/admin/descobrir-ats`

Cole a URL da página de carreiras de uma empresa e a tela identifica qual ATS ela usa e
qual seria o `board_token`. É reconhecimento, não ingestão: só criamos adapter novo depois
de confirmar que o endpoint é público e estável.

---

## O que ainda não existe

- **Planos e assinaturas.** O Stripe (Prompt 8C) não foi implementado. "Planos" na tela de
  Usuários significa planos de estudo, não plano pago. Quando houver cobrança, a gestão de
  assinatura entra aqui.
- **Comunidade.** Prevista, sem implementação.
- **Editar baselines pela interface.** Hoje é SQL.
