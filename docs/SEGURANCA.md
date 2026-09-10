# Auditoria de segurança — 2026-09-09 (revisada em 2026-09-10)

Varredura ampla das superfícies que um atacante tentaria, na ordem em que tentaria.
Cada achado abaixo foi **verificado no banco de produção**, não inferido do código.

Método: lints do Postgres (`get_advisors`), inventário de `pg_policies` / `pg_proc` /
grants, leitura dos middlewares e das server functions, e varredura do bundle público
gerado por `vite build`.

---

## Resumo

| # | Achado | Gravidade | Estado |
|---|---|---|---|
| 1 | Paywall não cobre `study.functions.ts` e `learning.functions.ts` | **Alto** | ✅ Corrigido 2026-09-10 |
| 2 | `expire_and_notify_prepaid()` executável sem login | Médio | ✅ Corrigido 2026-09-10 |
| 3 | `list_orphan_cv_objects()` executável sem login | Médio | ✅ Corrigido 2026-09-10 |
| 4 | `user_followed_companies` aceita sessão anônima | Baixo | ✅ Corrigido 2026-09-10 |
| 5 | Proteção contra senha vazada desligada | Baixo | Aberto |

**Estado em 2026-09-10.** Os achados 2 e 3 caíram na migration
`20260910112613_restringe_funcoes_internas_a_service_role` — conferido no ACL de
produção: `has_function_privilege('anon', …, 'EXECUTE')` devolve `false` para as
duas. Os achados 1 e 4 foram corrigidos no mesmo dia (detalhe nas seções 1 e 4).
Sobra o **achado 5**, que é um toggle no painel — sem código, sem exposição de dado.

O que **já está certo** está listado no fim — é a maior parte, e vale ler antes de
concluir que a casa está pegando fogo.

---

## 1. Paywall não cobre estudo nem aprendizagem — **Alto**

**A regra.** `CLAUDE.md`, regra 12: *"Esconder botão não é proteção — a server function
que serve dado pago usa `requireActiveSubscription`."*

**O que foi medido.** Cobertura de middleware por arquivo de server function:

| Arquivo | `createServerFn` | `requireSupabaseAuth` | `requireActiveSubscription` |
|---|---|---|---|
| `market.functions.ts` | 10 | 10 | **11** ✅ |
| `jobs.functions.ts` | 4 | 4 | **4** ✅ |
| `gap.functions.ts` | 2 | 2 | 1 (a outra é a prévia grátis) ✅ |
| `study.functions.ts` | 12 | 12 | **0** ❌ |
| `learning.functions.ts` | 9 | 9 | **0** ❌ |

**Por que isso vaza para o visitante, e não só para o não-pagante.**
`requireSupabaseAuth` valida o JWT e exige `sub`, mas **não checa `is_anonymous`**. Pela
regra 7, todo visitante recebe uma sessão anônima no primeiro acesso. Logo, o JWT que
qualquer pessoa tem no navegador ao abrir `rumvia.com.br` já satisfaz esse middleware.

**O que dá para pegar sem pagar, hoje.** `getCertsCatalog` e `getCoursesCatalog` leem
`certifications_catalog` e `courses_catalog`, cujas policies são
`FOR SELECT TO authenticated USING (is_active)` — sem dono, sem assinatura. Contagem
real na base: **37 certificações e 41 cursos**. Isso é exatamente o que
`PLANO_INCLUI` (`src/lib/plan-copy.ts`) vende como benefício pago:
*"Certificações e cursos recomendados pelo seu gap"*.

Alcançável de duas formas: chamando a server function, ou direto no PostgREST com o
JWT anônimo.

**Onde a RLS salva parcialmente.** Em `study_plans`, `study_items` e `study_logs` o
`WITH CHECK` tem `is_anonymous IS NOT TRUE`, então a sessão anônima não consegue
*escrever* um plano de estudos. Mas isso não protege o caso do meio: **conta permanente
sem assinatura ativa** passa na RLS e recebe o recurso pago — incluindo
`generatePlanFromGap`, que é o entregável central do plano de estudos.

**Esta é a mesma classe de falha já corrigida uma vez.** O commit `466f031` ("Fecha o
bypass do paywall: dado de mercado deixa de ser legivel pelo cliente") resolveu isso
para `market.functions.ts`. A correção não foi estendida a `study` e `learning`.

**Correção.** Encadear `requireActiveSubscription` depois de `requireSupabaseAuth` nas
duas famílias, no mesmo padrão de `market.functions.ts`:

```ts
.middleware([requireSupabaseAuth, requireActiveSubscription])
```

**Decisão de produto antes de aplicar:** o catálogo de certificações/cursos deve ser
*totalmente* pago, ou uma amostra entra na prévia grátis como isca (como já acontece com
skills e ferramentas em `PREVIA_GRATUITA`)? A resposta muda se a trava vai na server
function inteira ou só no recorte completo.

---

### ✅ Corrigido em 2026-09-10

**Decisão do dono:** catálogo **totalmente pago**, sem amostra na prévia.

O que foi feito, e por que só o primeiro item não bastava:

1. `requireActiveSubscription` encadeado nas **20** server functions das duas
   famílias (11 em `study.functions.ts`, 9 em `learning.functions.ts`).
2. **`revoke select on certifications_catalog, courses_catalog from anon,
   authenticated`** (migration `20260910130000_catalogo_de_aprendizagem_e_pago`).
   Esta é a que realmente fecha: sem ela o middleware seria decorativo, porque o
   PostgREST servia as duas tabelas direto para qualquer sessão anônima. Foi o
   mesmo remédio do dado de mercado em `20260903170641`.
3. As leituras de catálogo em `learning.functions.ts` passaram para
   `catalogDb()` (service_role), senão o revoke quebraria a tela de quem paga.
   Inclui `getUserCerts` e `getUserCourses`, que **embutem** o catálogo no
   `select` — o PostgREST exige SELECT na tabela embutida. Nesses dois a posse
   deixou de vir da RLS e passou a vir do `.eq("user_id", userId)` explícito,
   com `userId` saindo do JWT validado, nunca do input.

**Verificado em produção, antes e depois, com sessão anônima real
(`signInAnonymously`, que é o que todo visitante recebe):**

| | antes | depois |
|---|---|---|
| `GET /certifications_catalog` | 37 linhas | `42501` permission denied |
| `GET /courses_catalog` | 41 linhas | `42501` permission denied |

E o caminho do pagante segue de pé: as mesmas consultas por `service_role`
devolvem 11 certificações e 8 cursos para devops, e os dois joins embutidos
respondem 200 (`[]` porque `user_certifications` e `user_courses` estão zeradas).

Nota sobre `study_*`: ali não houve revoke. As tabelas são de dado do usuário,
protegidas por RLS com `is_anonymous IS NOT TRUE` no `WITH CHECK`. O buraco real
era o **meio-termo** — conta permanente sem assinatura ativa, que passava na RLS
e recebia `generatePlanFromGap`. É exatamente o caso que o middleware fecha.

---

## 2. `expire_and_notify_prepaid()` executável sem login — **Médio** — ✅ corrigido em `20260910112613`

`SECURITY DEFINER`, `search_path=public`, e o ACL concede `EXECUTE` a `anon`. Ou seja:
`POST /rest/v1/rpc/expire_and_notify_prepaid` funciona **sem autenticação nenhuma**.

A função escreve: insere em `notifications` e faz `UPDATE public.subscriptions SET
status = 'expired'`.

**Impacto real é limitado**, e vale ser preciso sobre isso:

- não aceita parâmetro, então não dá para alvejar um usuário específico;
- o `UPDATE` só atinge `current_period_end <= now()`, isto é, assinaturas que já
  deveriam ter expirado de qualquer forma — ninguém é expirado antes da hora;
- o `INSERT` tem trava de 7 dias por usuário, então não vira spam.

O que sobra é **escrita não autenticada num endpoint que deveria ser só do cron**.
Entrou junto com o PIX avulso (`20260908115451_pix_avulso_aviso_e_expiracao`) e não
recebeu o tratamento que o projeto já aplica nesses casos —
`20260903160018_is_admin_revoga_execute_de_public` é o precedente.

**Correção.**

```sql
REVOKE EXECUTE ON FUNCTION public.expire_and_notify_prepaid() FROM PUBLIC, anon, authenticated;
```

---

## 3. `list_orphan_cv_objects()` executável sem login — **Médio** — ✅ corrigido em `20260910112613`

Mesma configuração: `SECURITY DEFINER`, `EXECUTE` para `anon`. Devolve, do bucket `cvs`,
os objetos cujo dono não existe mais em `auth.users`:

```sql
select o.name, (o.metadata->>'size')::bigint, o.created_at from storage.objects o ...
```

`o.name` é o caminho, no formato `<user_id>/<arquivo>` — e **nome de arquivo de currículo
costuma conter o nome da pessoa** (`curriculo-fulano-2026.pdf`).

**Hoje devolve 0 linhas** — conferido. É vazamento **latente**, não ativo: passa a
devolver dado no momento em que alguém excluir a conta e sobrar objeto órfão, que é
justamente o caso de uso da função. Não dá acesso ao *conteúdo* do arquivo (isso é RLS de
storage, separado), só a nomes, tamanhos e datas.

É função de manutenção; não tem por que ser chamável pela internet.

**Correção.**

```sql
REVOKE EXECUTE ON FUNCTION public.list_orphan_cv_objects() FROM PUBLIC, anon, authenticated;
```

---

## 4. `user_followed_companies` aceita sessão anônima — **Baixo** — ✅ corrigido em `20260910150000`

A regra 6 do `CLAUDE.md` lista essa tabela entre as **exclusivas de conta permanente**,
que devem ter na policy:

```sql
USING (auth.uid() = user_id AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE)
```

As irmãs cumprem (`study_*`, `user_certifications`, `user_courses`,
`salary_observations` no INSERT). As três policies de `user_followed_companies`
(`ufc_select_own`, `ufc_insert_own`, `ufc_delete_own`) **não têm a cláusula**.

Impacto prático é pequeno: a pessoa só popula a própria lista, não lê a de ninguém e não
gera custo. É desvio da regra escrita, não brecha de dados — mas a regra existe para que
recurso de conta permanente não fique alcançável por sessão descartável.

---

## 5. Proteção contra senha vazada desligada — **Baixo**

O Supabase Auth sabe checar a senha contra o HaveIBeenPwned na hora do cadastro. Está
desativado. É um toggle no painel (Authentication → Policies), sem código.

---

## O que está certo

Levantado com o mesmo rigor dos achados, porque metade de uma auditoria é saber o que
**não** precisa de atenção:

- **Ninguém muda preço nem se dá uma assinatura.** `billing_plans` e `subscriptions` têm
  RLS ligada e **nenhuma policy de escrita** para `anon`/`authenticated`. Os grants são
  amplos, mas sem policy a RLS nega — a postura é negar por padrão. Foi a primeira coisa
  que testei, porque seria a falha mais cara.
- **RPCs de assinatura não vazam entre usuários.** `has_active_subscription`,
  `is_admin` e `can_access_paid_features` começam com
  `auth.role() = 'service_role' OR auth.uid() = _user_id`.
- **Escalada para admin está fechada.** O trigger `profiles_protege_colunas_privilegiadas`
  força `is_admin := false` no INSERT e levanta exceção se o UPDATE tentar mudar o campo,
  deixando passar só quem não é `authenticated`/`anon`. Está habilitado.
- **RPCs de mercado não são executáveis por anon nem authenticated** —
  `market_demand`, `market_scope_stats`, `refresh_market_views`, `dedupe_job_postings`.
- **Os 6 endpoints de `api/public/` exigem segredo** e devolvem 401: quatro com
  `x-cron-secret` (com fallback para o Vault via `verify_cron_secret`), o
  `ingest-webhook` com `x-ingest-token` comparado por hash com `timingSafeEqual`, e o
  `asaas-webhook` com `asaas-access-token`, também `timingSafeEqual`.
- **Nenhum segredo real no bundle público.** A varredura casou uma vez com `sb_secret_`,
  mas é a função que *detecta* o formato da chave (`startsWith('sb_secret_')`), não uma
  chave. Busca por valores reais (`$aact_…`, `sb_secret_…`, JWT) não retornou nada.
- **`.env` não está versionado** (ignorado em `.gitignore:38`, 0 arquivos rastreados).
- **`billing_events`, `job_posting_raw` e `parse_rate_limits`** aparecem no lint como
  "RLS sem policy". Isso é **intencional e correto**: RLS ligada sem policy = ninguém
  além de `service_role` lê ou escreve.

---

## Ruído do lint que não é achado

- **`auth_allow_anonymous_sign_ins` em ~30 tabelas.** O lint marca toda policy que
  atinge o papel `authenticated`, e no RUMVIA a sessão anônima *é* `authenticated` por
  desenho (regra 7). Verifiquei tabela por tabela: as que exigem conta permanente têm a
  cláusula `is_anonymous`, exceto o achado 4. As demais (`cvs`, `profiles`,
  `user_skills`, `gap_analyses`) permitem anônimo **de propósito** — é a prévia grátis.
- **`extension_in_public`** (`pg_trgm`, `unaccent`, `citext`, `pg_net`). Pré-existente,
  sem exploração conhecida nesta configuração. Mover extensão de schema quebra índices e
  funções que as referenciam; não compensa agora.

---

## Ordem sugerida de correção

A ordem original era: 2 e 3 primeiro (dois `REVOKE`, sem decisão de produto), 4, 5, e
o achado 1 por último — apesar de ser o mais grave — porque era o único que mudava
comportamento para usuário real e dependia de decisão de produto.

**Executada em 2026-09-10, em outra ordem:** 2 e 3 saíram em
`20260910112613_restringe_funcoes_internas_a_service_role`, e o achado 1 foi
antecipado porque o lançamento do MVP dependia dele — a decisão de produto veio
junto (catálogo totalmente pago).

### O que continua aberto

Só o **achado 5** — toggle em Authentication → Policies no painel do Supabase, sem
código. Não expõe dado de usuário nem recurso pago, e por isso não bloqueia o
lançamento.

O achado 4 saiu em `20260910150000_empresas_seguidas_exige_conta_permanente`, e a
aplicação revelou uma **divergência entre a regra escrita e o que as irmãs fazem**,
que vale registrar porque a próxima pessoa vai tropeçar nela:

- A **regra 6** do `CLAUDE.md` escreve a cláusula no `USING`.
- As irmãs que esta auditoria citou como conformes — `user_certifications` e
  `user_courses` — são `FOR ALL` com `USING (user_id = auth.uid())` e a cláusula
  **só no `WITH CHECK`**. Ou seja, guardam a escrita e deixam a leitura livre para
  o dono.

Segui a constituição: a cláusula entrou nos três comandos de
`user_followed_companies`. Custa nada e fecha mais — quem não pode inserir não terá
linha para ler, e conta permanente tem `is_anonymous` falso. Conferido antes de
aplicar: a tabela tinha 1 linha, de conta permanente, então ninguém perdeu acesso.

**Verificado depois, com sessão anônima real:** o `POST` em
`/rest/v1/user_followed_companies` com uma empresa existente devolve
`42501 — new row violates row-level security policy`. Antes, inseria.

Se a divergência incomodar, o lugar de resolvê-la é a regra 6 — decidindo se o
padrão do projeto guarda a escrita ou também a leitura — e não caso a caso na
próxima migration.
