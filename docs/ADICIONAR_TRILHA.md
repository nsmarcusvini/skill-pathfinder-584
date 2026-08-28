# Como adicionar uma trilha de carreira ao RUMVIA

Adicionar trilha = dados no banco. Nenhuma linha de código React precisa mudar.

> **Exemplo pronto:** `supabase/migrations/20260827200000_tracks_frontend_backend_qa.sql`
> faz todos os passos abaixo de uma vez, para `frontend`, `backend` e `qa`. Quando em
> dúvida sobre a forma exata de um INSERT, copie de lá — o SQL deste guia foi conferido
> contra o schema real de `20260826145125_*.sql`.

O exemplo daqui usa uma trilha hipotética `mobile`.

---

## Passo 1 — Criar a trilha e variantes de cargo

Via Admin → Trilhas → "Nova trilha":

- **Chave** (`key`): snake_case, minúsculas, sem espaço. Ex: `mobile`. Imutável depois de criado.
- **Nome exibido**: Ex: `Mobile`.
- **Variantes de cargo**: uma por linha. Usadas para classificar vagas. Ex:
  ```
  Mobile Developer
  Desenvolvedor Android
  Desenvolvedor iOS
  ```

O admin grava cada variante com `search_terms = [nome em minúsculas]`. Para uma
classificação decente vale mexer no banco e dar vários termos por variante:

```sql
-- Trilha
INSERT INTO public.career_tracks (key, name, description, icon, color_token, sort_order)
VALUES ('mobile', 'Mobile', 'Aplicativos nativos e híbridos para Android e iOS.', 'smartphone', 'accent-500', 7)
ON CONFLICT (key) DO NOTHING;

-- Variantes de cargo (key é NOT NULL e único por trilha; a coluna é `name`,
-- não `role_title`)
INSERT INTO public.track_role_variants (track_id, key, name, search_terms, sort_order) VALUES
  ((SELECT id FROM public.career_tracks WHERE key = 'mobile'), 'mobile_developer', 'Mobile Developer',
   ARRAY['mobile developer','desenvolvedor mobile','engenheiro mobile','mobile engineer']::text[], 1),
  ((SELECT id FROM public.career_tracks WHERE key = 'mobile'), 'android_developer', 'Android Developer',
   ARRAY['android developer','desenvolvedor android','engenheiro android']::text[], 2)
ON CONFLICT (track_id, key) DO NOTHING;
```

### Cuidado com os `search_terms`

`classifyTrack` (em `src/lib/ingest/pipeline.server.ts`) compara cada termo com
`title_normalized` usando **substring**, e o **termo mais longo vence**. E
`normalizeTitle` (`src/lib/ingest/normalize.ts`) já tirou acento, passou para minúsculas
e trocou hífen por espaço antes disso.

Consequências práticas:

- termo com hífen (`front-end`) **nunca casa** numa vaga — inclua também `front end`;
- termo com acento nunca casa na ingestão (inclua a forma sem acento; a forma acentuada
  ainda serve para o `detectTrackAndSeniority` do parser de CV, que normaliza os dois lados);
- termo muito curto rouba vaga de outra trilha só quando nenhum termo mais longo casar —
  prefira termos de 8+ caracteres.

---

## Passo 2 — Adicionar skills e baselines

`track_skill_baselines` tem **uma linha por (trilha, skill, senioridade)** — as quatro
senioridades (`junior`, `pleno`, `senior`, `staff`) são obrigatórias, senão a trilha fica
sem peso no recorte daquele nível. Colunas reais:

| Coluna | Tipo | Observação |
|---|---|---|
| `seniority` | text | `junior` / `pleno` / `senior` / `staff` |
| `importance` | smallint 0–100 | é o "baseline" da fórmula de gap |
| `required_level` | smallint 0–5 | nível exigido; entra como `min(user_level/required_level, 1)` |
| `is_core` | boolean | skill fundadora da trilha (poucas por trilha) |

```sql
-- Se a skill ainda não existe, crie primeiro (canonical_name e slug são únicos)
INSERT INTO public.skills (canonical_name, slug, category_id, is_tool, is_certifiable, match_patterns, is_ambiguous)
VALUES ('Swift', 'swift', (SELECT id FROM public.skill_categories WHERE key = 'language'), false, false, '{}'::text[], false)
ON CONFLICT (canonical_name) DO NOTHING;

-- Baselines: escreva só a importância do júnior e derive as outras senioridades
-- com o mesmo degrau do seed 0002 (+14 pleno, +24 sênior, +28 staff, teto 100).
INSERT INTO public.track_skill_baselines (track_id, skill_id, seniority, importance, required_level, is_core)
SELECT t.id, s.id, sen.seniority,
       LEAST(v.base_imp + sen.delta, 100)::smallint,
       (CASE
          WHEN v.base_imp >= 71 THEN CASE sen.seniority WHEN 'junior' THEN 2 WHEN 'pleno' THEN 4 ELSE 5 END
          WHEN v.base_imp >= 55 THEN CASE sen.seniority WHEN 'junior' THEN 1 WHEN 'pleno' THEN 3 WHEN 'senior' THEN 4 ELSE 5 END
          WHEN v.base_imp >= 41 THEN CASE sen.seniority WHEN 'junior' THEN 1 WHEN 'pleno' THEN 3 ELSE 4 END
          ELSE CASE sen.seniority WHEN 'junior' THEN 0 WHEN 'pleno' THEN 2 ELSE 3 END
        END)::smallint,
       v.is_core
FROM (VALUES
  ('Kotlin', 80, true),
  ('Swift',  76, true),
  ('Git',    78, true),
  ('REST',   66, false)
) AS v(skill_name, base_imp, is_core)
JOIN public.skills s ON s.canonical_name = v.skill_name
CROSS JOIN public.career_tracks t
CROSS JOIN (VALUES ('junior', 0), ('pleno', 14), ('senior', 24), ('staff', 28)) AS sen(seniority, delta)
WHERE t.key = 'mobile'
ON CONFLICT (track_id, skill_id, seniority) DO NOTHING;
```

> O `JOIN ... ON s.canonical_name = v.skill_name` **descarta em silêncio** qualquer nome
> digitado errado. Vale rodar antes:
> `SELECT v.skill_name FROM (VALUES ...) v LEFT JOIN public.skills s ON s.canonical_name = v.skill_name WHERE s.id IS NULL;`

### Aliases (obrigatório para skill nova)

O matcher é determinístico (regra 2 e 4 do `CLAUDE.md`): sem alias, a skill só casa
pelo nome canônico exato.

```sql
INSERT INTO public.skill_aliases (skill_id, alias, lang, source) VALUES
  ((SELECT id FROM public.skills WHERE canonical_name = 'Swift'), 'swiftui', 'en', 'curated')
ON CONFLICT (alias) DO NOTHING;
```

Três armadilhas:

- `alias` é **UNIQUE global** (citext). Se o termo já pertence a outra skill, o
  `ON CONFLICT` engole a linha e ela nunca vale nada — confira antes com
  `SELECT * FROM public.skill_aliases WHERE alias = 'termo';`
- não crie skill nova cujo nome canônico já seja alias de outra skill: as duas casariam
  no mesmo texto e o peso é contado em dobro na aderência.
- skill com nome ambíguo (palavra comum, sigla curta) precisa de `is_ambiguous = true` +
  `match_patterns`. Para skill ambígua o padrão **substitui** o nome canônico no matcher —
  então o padrão tem de cobrir também a grafia por extenso.

---

## Passo 3 — Seed de certificações e cursos (opcional, recomendado)

`certifications_catalog` e `courses_catalog` referenciam trilhas por `track_ids uuid[]`:

```sql
INSERT INTO public.certifications_catalog (
  name, issuer, level, track_ids, skill_ids, official_url, cost_usd,
  exam_duration_min, validity_months, difficulty
)
SELECT
  'Associate Android Developer', 'Google', 'Associate',
  ARRAY(SELECT id FROM public.career_tracks WHERE key = 'mobile'),
  '{}'::uuid[],
  'https://developers.google.com/certification/associate-android-developer',
  NULL, NULL, 36, 'intermediario'
WHERE NOT EXISTS (
  SELECT 1 FROM public.certifications_catalog WHERE name = 'Associate Android Developer'
);
```

Duas regras: quando a certificação **já existe** para outra trilha, anexe o id
(`SET track_ids = track_ids || t.id`) em vez de duplicar a linha; e quando o preço ou a
duração não são conhecidos, deixe `NULL` — a UI trata, e inventar número é proibido.

---

## Passo 4 — Classificar as vagas já ingeridas

Vagas antigas cujo título casa com as variantes novas continuam com `track_id IS NULL`
(a ingestão só reclassifica o que revê). Dá para atribuir direto, com o mesmo critério do
`classifyTrack` — substring em `title_normalized`, termo mais longo vence:

```sql
WITH escolha AS (
  SELECT DISTINCT ON (jp.id) jp.id AS job_id, trv.track_id, trv.id AS role_variant_id
    FROM public.job_postings jp
    JOIN public.track_role_variants trv ON trv.is_active
    CROSS JOIN LATERAL unnest(trv.search_terms) AS termo
   WHERE jp.track_id IS NULL
     AND jp.title_normalized IS NOT NULL
     AND position(lower(termo) IN jp.title_normalized) > 0
   ORDER BY jp.id, length(termo) DESC
)
UPDATE public.job_postings jp
   SET track_id = e.track_id, role_variant_id = e.role_variant_id
  FROM escolha e WHERE jp.id = e.job_id;
```

Se você criou skills novas, as vagas já ingeridas ainda não têm vínculo com elas.
Reprocessar a extração sem rebuscar nas fontes:

```bash
bun scripts/extract-skills.ts
```

E para buscar vagas novas: **Admin → Fontes → Rodar ingestão** (ou o próximo ciclo do pg_cron).

---

## Passo 5 — Refreshar materialized views

```sql
SELECT public.refresh_market_views();
```

A função cobre as quatro views (`mv_skill_demand_by_track`, `mv_tool_demand`,
`mv_company_hiring`, `mv_salary_stats`) e usa `CONCURRENTLY` — por isso **não** pode ser
chamada de dentro de uma transação/migration. Alternativa: `POST /api/public/refresh-market-views`
com o header `x-cron-secret`.

---

## Verificação

1. **Admin → Trilhas** — a nova trilha aparece com a contagem de skills e vagas.
2. **Admin → Saúde** — as views foram refreshadas.
3. No onboarding, selecione a nova trilha e confirme que o dashboard de gap carrega
   (sem vagas classificadas o score sai vazio, não zero).

---

## Invariantes que nunca devem ser violados

- Nenhum componente React tem `if (track === 'mobile')` ou similar.
  O código lê `career_tracks` do banco e renderiza qualquer trilha dinamicamente.
- `market_segment` é sempre `'br'` ou `'remoto_global'`. Nunca misturar.
- A fórmula de aderência vive só em `src/lib/gap.functions.ts`. Trilha nova não ganha
  cálculo próprio.
- RLS deve cobrir qualquer nova tabela com `auth.uid() = user_id`.
