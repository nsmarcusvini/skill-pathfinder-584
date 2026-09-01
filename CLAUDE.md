# RUMVIA — Instruções permanentes do projeto

> Este arquivo é lido pelo Claude Code no início de toda sessão. É a constituição do projeto.
> Regras aqui **vencem** qualquer instrução casual do prompt.

## O que é o RUMVIA

Aplicação que compara o CV de um profissional de tecnologia com a demanda real do mercado
de vagas e mostra, em porcentagem, o quanto ele está aderente à trilha de carreira que
escolheu. Também mostra as ferramentas mais pedidas, empresas contratando, faixa salarial,
e recomenda plano de estudos.

Trilhas ativas: `devops` (variantes: DevOps Engineer, Platform Engineer, SRE),
`data_engineer`, `fullstack`, `frontend`, `backend` e `qa`. As três últimas entraram
em 2026-08-27 pela migration `20260827200000_tracks_frontend_backend_qa.sql` — só
dados, nenhuma linha de código (regra 1). Trilha nova segue `docs/ADICIONAR_TRILHA.md`.

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
    nunca vai para JSX: vem de `billing_plans`. Esconder botão não é proteção — a
    server function que serve dado pago usa `requireActiveSubscription`.

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
      assinatura.tsx           # ✅ pronto (Asaas, R$ 24,90/mês)
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
- [x] **Prompt 8C** — Assinatura Pro R$ 24,90/mês + paywall obrigatório (2026-08-31),
      migrada da AbacatePay para o **Asaas** em 2026-09-01 (a AbacatePay não faz
      cobrança recorrente para contas novas). **O produto é pago:** só a
      prévia do CV (`/`, `/analise`) roda sem conta; `_conta/*` e `/onboarding` exigem
      assinatura ativa. Exceções: `/assinatura` (é onde se paga) e `/conta` (LGPD —
      exportar/excluir não pode ser trancado). Admin entra sem pagar
      (`can_access_paid_features`). Runbook em `docs/PAGAMENTOS.md`.

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