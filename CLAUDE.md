# RUMVIA — Instruções permanentes do projeto

> Este arquivo é lido pelo Claude Code no início de toda sessão. É a constituição do projeto.
> Regras aqui **vencem** qualquer instrução casual do prompt.

## O que é o RUMVIA

Aplicação que compara o CV de um profissional de tecnologia com a demanda real do mercado
de vagas e mostra, em porcentagem, o quanto ele está aderente à trilha de carreira que
escolheu. Também mostra as ferramentas mais pedidas, empresas contratando, faixa salarial,
e recomenda plano de estudos.

Trilhas **ativas**: `devops` (variantes: DevOps Engineer, Platform Engineer, SRE),
`data_engineer`, `fullstack` e `backend`. `qa` e `frontend` existem mas estão
**desativadas** (`is_active = false`) — saem de toda a interface, que filtra por
`is_active`. Trilha nova segue `docs/ADICIONAR_TRILHA.md`.

O critério para uma trilha estar ativa é **amostra**, não código pronto:
`MIN_SAMPLE` em `gap.functions.ts` é 30, e abaixo disso o gap sobe marcado como
`lowConfidence`. `frontend` foi desativada em 2026-09-10 com 6 vagas no segmento
`br` — a app avisaria que o número não é confiável, e não dá para cobrar por isso.
Quando a ingestão passar dos 30, um `UPDATE career_tracks SET is_active = true`
devolve a trilha, sem deploy.

`backend` e `frontend` são trilhas próprias, **não subconjuntos de `fullstack`**:
"Senior Backend Software Engineer" conta para Back-End. Quem decide isso é
`track_role_variants.priority` (2026-09-08) — o desempate do classificador era só o
tamanho do termo, e os termos genéricos e compridos do fullstack ("software engineer")
venciam os específicos e curtos ("backend"). Sobreposição entre trilhas é esperada:
a mesma empresa e a mesma faixa salarial aparecem em mais de uma.

## Stack real (não a que estava no system design original)

O Lovable montou o projeto com **TanStack Start**, não com React + Vite + Deno Edge Functions.
Você NÃO vai reverter isso. Adapte-se.

| Camada | Realidade |
|---|---|
| Framework | TanStack Start 1.168 + Nitro + Vite 8 + React 19 |
| Roteamento | file-based em `src/routes/` (TanStack Router) |
| Server logic | `createServerFn` em `src/lib/*.functions.ts` e arquivos `*.server.ts` |
| API endpoints | Route handlers em `src/routes/api/public/*.ts` (o que seria Edge Function) |
| Auth | Supabase Auth (anônimo + permanente) + `@lovable.dev/cloud-auth-js` para OAuth Google |
| Banco | Supabase Postgres (extensões: `pg_trgm`, `unaccent`, `citext`, `pg_cron`, `pg_net`, `pgcrypto` — **sem** `vector`) |
| UI | shadcn/ui new-york + Tailwind 4 + Design System RUMVIA (base Industry) |
| Dados | TanStack Query 5 + Supabase JS |
| Package manager | Bun (`bun.lock`, `bunfig.toml`) — use `bun install`, `bun run dev` |

Cron jobs do `pg_cron` chamam URLs do próprio app via `pg_net`
(`https://<projeto>.lovable.app/api/public/...`).

## Regras inegociáveis

1. **Trilha é dado, não código.** Nenhum componente pode ter
   `if (track === 'devops')` ou similar. Se você se pegar escrevendo isso, pare e leia
   `career_tracks` + `track_role_variants` + `track_skill_baselines` do banco. Adicionar
   trilha nova = inserir linhas no banco, zero mudança de código.

2. **Sem LLM no MVP.** O parser de CV e o extrator de skills de vagas são
   **determinísticos**: dicionário canônico + aliases bilíngues (pt/en) + regex para
   `is_ambiguous` + similaridade trigram >= 0.86. Se pensar "aqui um LLM resolveria melhor",
   a resposta é: sim, mas fora do escopo. Adicione o termo em `pending_skill_terms` para
   curadoria.

3. **Uma única fonte da fórmula de gap.** Está em `src/lib/gap.functions.ts`. Nenhuma tela
   recalcula score. Se precisar de um subset, chame `compute-gap` com params diferentes.
   Fórmula: `demanda = vagas_com_skill / total_vagas`; `peso = 0.7*demanda + 0.3*(baseline/100)`;
   `cobertura = min(user_level/required_level, 1)`; `aderência = Σ(peso*cobertura) / Σ(peso) * 100`.

4. **Um único skill matcher.** `src/lib/skill-matcher.ts` é compartilhado entre
   `cv-parser.server.ts` e `jd/extract.server.ts`. Se divergir, o score fica inconsistente.
   Nunca duplicar a lógica de matching em outro lugar.

5. **`market_segment` sempre.** Toda vaga tem `br` ou `remoto_global`. Toda materialized
   view agrega por segmento. Toda tela filtra por segmento ativo. Nunca somar os dois
   no mesmo número. Salário: BR em BRL, remoto_global em USD, conversão só explícita
   com data da taxa (`app_settings.usd_brl`).

6. **RLS em toda tabela.** Dados de usuário: `auth.uid() = user_id`. Anônimo é
   `authenticated` no JWT — em tabelas exclusivas de conta permanente (study_*,
   user_certifications, user_courses, user_followed_companies, salary_observations com
   `source='user'`), a policy tem:
   ```sql
   USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
   ```
   Escrita em tabelas de mercado: só `service_role`.

   **Ligar RLS não basta, e não conceder não é o mesmo que revogar.** O schema `public`
   deste projeto tem `ALTER DEFAULT PRIVILEGES` concedendo TUDO a `anon` e
   `authenticated` em toda tabela nova — uma tabela criada sem `REVOKE` nasce com
   `anon=arwdDxtm | authenticated=arwdDxtm`, mesmo que nenhum `GRANT` a mencione.
   Então **toda tabela nova leva `REVOKE ALL ON <tabela> FROM anon, authenticated`
   explícito**, nomeando os papéis (`FROM PUBLIC` não remove grant explícito de papel),
   e só depois o `GRANT` do que é intencional. O mesmo vale para funções
   (`REVOKE EXECUTE ... FROM anon, authenticated, public`).
   **O que prova o estado é `relacl` / `proacl`, nunca o texto do GRANT** — confira com
   `select relacl from pg_class` / `select proacl from pg_proc` depois de aplicar.
   Já foi errado três vezes: `list_orphan_cv_objects` e `expire_and_notify_prepaid`
   (2026-09-10, migration `20260910112613`) e as três tabelas de
   `resubscribe_blocks`/`usage_*` (2026-09-10, migration `20260910142000`) — nesta
   última, na migration seguinte à que registrou a lição.

7. **Sessão anônima é sagrada.** `signInAnonymously` no primeiro acesso. Ao converter em
   conta permanente, usar `updateUser` ou `linkIdentity` — **preservar `user.id`**. NUNCA
   criar usuário novo e copiar dados. Está em `src/hooks/use-auth.tsx` — não mexer sem
   entender.

8. **Segredos só em variáveis de ambiente do servidor.** Nada no client. Nada em `.env`
   commitado. Cron secret vive no Supabase Vault, lido via `vault.decrypted_secrets`.

9. **Ingestão via adapter pattern.** Interface `JobAdapter` em `src/lib/ingest/adapters/`.
   Adicionar fonte nova = 1 arquivo novo + linha em `job_sources`. **Proibido scraping
   direto de LinkedIn, Indeed, Glassdoor** (ToS + antibot). Fontes pagas viram adapters
   quando ativadas.

10. **Interface em pt-BR.** Textos de vaga podem estar em inglês.

11. **Design System (base Industry) é lei.** Cantos retos (`.blueprint`), hairlines,
    Barlow / Barlow Condensed, paleta em `src/lib/design-tokens.ts`. Nunca hex solto
    em componente. shadcn tem que respeitar radius 0. Escala de gap:
    critical/low/mid/high — cor vem dos tokens.

12. **A conta é paga. Só a prévia é grátis.** `/` e `/analise` rodam sem cadastro;
    tudo em `_conta/*` e o `/onboarding` exigem assinatura ativa. Rota nova de `_conta`
    já nasce paga — não precisa fazer nada, `_conta.tsx` cobre. As duas exceções são
    `/assinatura` (é onde se paga) e `/conta` (exportar/excluir é direito LGPD, não
    benefício de plano); mexer nessa lista é decisão de produto, não de código.
    Nenhum texto novo pode chamar a **conta** de grátis — a frase de bloqueio é
    `AVISO_ACESSO_PAGO` em `src/lib/plan-copy.ts` e é a mesma em todo o funil. Preço
    nunca vai para JSX: vem de `billing_plans`, que tem **N ciclos ativos** (hoje
    mensal, trimestral e anual). Não existe plano padrão no código: a vitrine mostra
    o que estiver ativo, ordenado por `sort_order`, e o checkout cobra o `planKey`
    escolhido. Ciclo novo, preço novo ou desconto novo = `UPDATE`/`INSERT` em
    `billing_plans`, zero deploy — o desconto exibido é **derivado**
    (`price_cents / months` contra o maior equivalente mensal), nunca gravado.
    Esconder botão não é proteção — a server function que serve dado pago usa
    `requireActiveSubscription`. E **middleware sozinho também não é proteção**:
    enquanto `anon`/`authenticated` tiverem GRANT de SELECT na tabela, dá para ler
    tudo direto pelo PostgREST sem passar pela server function — sessão anônima é
    `authenticated` no JWT (regra 7). Esse erro já foi cometido duas vezes (dado de
    mercado em 2026-09-03, catálogo de certificações/cursos em 2026-09-10). Feature
    paga nova = `requireActiveSubscription` **+** `revoke select … from anon,
    authenticated` **+** leitura por `supabaseAdmin`. Os três, sempre.

## Layout do projeto

```
src/
  routes/                      # File-based routing do TanStack Router
    index.tsx                  # Landing (visitante anônimo)
    analise.tsx                # Teaser do parse do CV
    login.tsx, cadastro.tsx    # Auth
    onboarding.tsx
    privacidade.tsx
    _conta/                    # Segmento protegido (requer sessão)
      dashboard.tsx            # ✅ pronto
      cv.tsx                   # ✅ pronto (606 linhas)
      minhas-skills.tsx        # ✅ pronto (682 linhas)
      ferramentas.tsx          # ❌ esqueleto, precisa preencher (Prompt 9)
      empresas.tsx             # ❌ esqueleto, precisa preencher (Prompt 9)
      salarios.tsx             # ❌ esqueleto (Prompt 10)
      progresso.tsx            # ❌ esqueleto (Prompt 11)
      certificacoes.tsx        # ❌ esqueleto (Prompt 12)
      cursos.tsx               # ❌ esqueleto (Prompt 12)
      conta.tsx                # ✅ pronto
      assinatura.tsx           # ✅ pronto (Asaas; mensal/trimestral/anual)
      admin.*.tsx              # ⚠️ parcial (falta trilhas e saúde)
    api/public/                # Endpoints de servidor (o que seria Edge Function)
      ingest-jobs.ts
      extract-jd-skills.ts
      refresh-market-views.ts
      ingest-webhook.ts
      asaas-webhook.ts         # eventos de pagamento (header asaas-access-token)
  lib/
    skill-matcher.ts           # ⚠️ MATCHER ÚNICO — não duplicar em outro lugar
    gap.functions.ts           # ⚠️ FÓRMULA ÚNICA de aderência
    cv-parser.server.ts        # Pipeline determinístico do CV
    ingest/                    # Adapters + pipeline compartilhado
      adapters/
        ats.ts, aggregators.ts, csv-manual.ts   # ativos
        adzuna.ts, jsearch.ts                    # esqueleto desativado
      pipeline.server.ts       # Reutilizado por PULL e PUSH webhook
    jd/                        # Extração de skills de vagas
    design-tokens.ts
    billing.functions.ts       # assinatura: overview, checkout, cancelamento
    plan-copy.ts               # ⚠️ texto do plano — landing e /assinatura leem daqui
    asaas/                     # client REST v3 + processamento de webhook
  hooks/
    use-auth.tsx               # ⚠️ anonymous sign-in + conversão — não regredir
    use-market.tsx             # trilha + segmento globais
    use-gap.tsx
    use-subscription.tsx       # ⚠️ FONTE ÚNICA de isPro/canAccess no front
  components/
    rumvia/                    # Design System RUMVIA
    auth/
    app/
    ui/                        # shadcn/ui (não editar direto)
  integrations/
    supabase/
      client.ts, client.server.ts, types.ts, auth-middleware.ts, ...
supabase/
  migrations/                  # 15 migrations rodadas; nomeadas por timestamp
  seed/
    0002_rumvia_seed.sql       # trilhas + skills + baselines
    0004_rumvia_jobs_seed.sql  # 150 vagas fictícias
```

## Como trabalhar

- Use **Bun**, não npm/pnpm. `bun install`, `bun run dev`, `bun run build`.
- Antes de criar arquivo, procure se já existe algo parecido. Este projeto tem redundância
  quase zero — o Lovable organizou bem, respeite.
- Quando criar migration, use timestamp do dia atual e nomeie descritivamente. Não
  reordene as existentes.
- Toda nova server function em `src/lib/*.functions.ts` deve validar auth (existe
  `requireSupabaseAuth` em `src/integrations/supabase/auth-middleware.ts`).
- Toda nova rota `_conta/*` está automaticamente protegida por `src/routes/_conta.tsx`.
- Não edite arquivos em `src/components/ui/` — são gerados pelo shadcn. Se precisar
  customizar, envolva num componente próprio em `src/components/rumvia/`.
- Não ligue código de front direto em materialized view. Passe por server function.
- Ao terminar cada feature, atualize `docs/PROGRESS.md` marcando o item concluído (se
  o arquivo não existir, crie).

## Roadmap que sobrou (nesta ordem)

- [ ] **Prompt 9** — Ferramentas + Empresas (rotas em `_conta/ferramentas.tsx` e
      `_conta/empresas.tsx` + `src/lib/market.functions.ts`)
- [ ] **Prompt 10** — Salários (`_conta/salarios.tsx` + adições ao `market.functions.ts`)
- [ ] **Prompt 11** — Progresso (migration + `src/lib/study.functions.ts` +
      `_conta/progresso.tsx`)
- [ ] **Prompt 12** — Certificações + Cursos (migration + seed + `learning.functions.ts` +
      duas rotas)
- [ ] **Prompt 13** — Admin de trilhas + painel de saúde
- [ ] **Prompt 14** — Expurgo de anônimos + notificações + LGPD (export/delete) +
      responsividade + smoke test
- [x] **Prompt 8C** — Assinatura Pro + paywall obrigatório (2026-08-31),
      migrada da AbacatePay para o **Asaas** em 2026-09-01 (a AbacatePay não faz
      cobrança recorrente para contas novas). **O produto é pago:** só a
      prévia do CV (`/`, `/analise`) roda sem conta; `_conta/*` e `/onboarding` exigem
      assinatura ativa. Exceções: `/assinatura` (é onde se paga) e `/conta` (LGPD —
      exportar/excluir não pode ser trancado). Admin entra sem pagar
      (`can_access_paid_features`). Três ciclos desde 2026-09-03 — mensal R$ 29,90,
      trimestral R$ 80,70 (−10%) e anual R$ 286,80 (−20%). Runbook em
      `docs/PAGAMENTOS.md`.

Detalhes completos de cada um vivem em `docs/roadmap/`.

## Coisas que já sei que quebram

- **Domínio de produção é `rumvia.com.br`**, servido pela Vercel desde 2026-09-01 (antes
  Netlify; antes disso caía numa página do GoDaddy Website Builder). `app_settings.app_base_url`
  e `.env`'s `APP_BASE_URL` já refletem isso. A nota antiga sobre "cron aponta pra URL de
  preview do Lovable" (`20260826170959_*` / `20260826171043_*`) está obsoleta: aqueles jobs
  não existem mais em `cron.job` — a ingestão roda via `bun run scripts/ingest.ts` manual
  (ver PROGRESS.md). Nenhum dos 4 crons ativos hoje (`rumvia-expire-jobs`,
  `rumvia-notify-certs`, `rumvia-purge-anon`, `rumvia-refresh-market-views`) chama URL
  nenhuma — são só função SQL.
- **`use-market.tsx` deriva segmento de `profile.target_region`.** Se o onboarding
  não estiver gravando esse campo, tudo cai em `br` por default. Verificar em
  `src/routes/onboarding.tsx` antes de mexer em Ferramentas.
- **Gateway de pagamento recusa webhook em localhost.** Precisa de HTTPS público em
  `APP_BASE_URL`. Para testar em dev, exponha o app com um túnel (cloudflared/ngrok) antes
  de rodar `bun run scripts/asaas-setup.ts`.

- **A `ASAAS_API_KEY` começa com `$` e o bun a expande como variável** — mesmo entre
  aspas simples. No `.env` só funciona com aspas DUPLAS e `\$` escapado. Sem isso a chave
  chega vazia e o erro parece "chave inválida". Detalhe em `docs/PAGAMENTOS.md`.

- **A hospedagem é a Vercel** (migrada do Netlify em 2026-09-01) e o domínio canônico é
  `https://www.rumvia.com.br` — o apex faz **308** para o `www`. Toda URL registrada em
  terceiro (webhook de gateway, callback de OAuth) tem que usar o `www`: webhook é POST, e
  cliente que não segue redirect simplesmente falha.

- **`linkIdentity` na tela de login sempre falha com `identity_already_exists`.** Todo
  visitante é anônimo (`signInAnonymously` no primeiro acesso), então "quem é anônimo,
  vincula" mandava para o `linkIdentity` até quem só queria voltar para uma conta que já
  existe — e o GoTrue recusa, porque aquela identidade Google já pertence à conta
  permanente. Por isso `signInWithGoogle` recebe intenção (`"entrar"` | `"vincular"`,
  2026-09-10): `/login` e a aba "Já tenho conta" do diálogo passam `"entrar"` e vão por
  `signInWithOAuth`; `/cadastro` e o fluxo com CV enviado continuam em `linkIdentity`
  para preservar o `user.id` (regra 7).

- **Erro de OAuth volta no fragmento, não só na query.** O GoTrue devolve
  `/auth/callback?error=…#error=…`, e `auth.callback.tsx` lia só `type`: sem sessão e sem
  erro reconhecido, a tela ficava presa em "Confirmando acesso" para sempre. Hoje o
  callback lê os dois lados, tem tela própria para `identity_already_exists` (com o
  atalho de entrar na conta existente) e um timeout de 12s que vira saída com link para
  o login — nenhum caminho pode terminar em spinner eterno.

- **Anonymous sign-in precisa estar habilitado no painel do Supabase**
  (Authentication → Providers). Se `useAuth` receber erro silencioso, é aqui.

- **SMTP quebrado derruba o cadastro inteiro.** A conversão anônimo→permanente dispara
  e-mail de confirmação; se o SMTP falhar, `PUT /auth/v1/user` devolve 500 e ninguém cria
  conta. Provedor é a Resend (`Username` é literalmente `resend`, não um e-mail).
  Diagnóstico e tabela de erros em `docs/EMAIL.md` — os erros ficam em `auth_logs`,
  não no console do navegador.

## O que fazer quando estiver em dúvida

- Sobre arquitetura: releia este arquivo.
- Sobre uma feature específica: `docs/roadmap/prompt-N.md`.
- Sobre uma decisão que não está aqui: pergunte ao usuário antes de assumir.
- Nunca invente dado. Se uma tela precisa mostrar número e o número não existe ainda,
  use `<EmptyState>` — nunca placeholder com valor falso.