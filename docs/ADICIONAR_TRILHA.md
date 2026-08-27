# Como adicionar uma trilha de carreira ao RUMVIA

Adicionar trilha = dados no banco. Nenhuma linha de código React precisa mudar.

---

## Passo 1 — Criar a trilha e variantes de cargo

Via Admin → Trilhas → "Nova trilha":

- **Chave** (`key`): snake_case, minúsculas, sem espaço. Ex: `backend`. Imutável depois de criado.
- **Nome exibido**: Ex: `Backend Engineer`.
- **Variantes de cargo**: uma por linha. Usadas para filtrar vagas. Ex:
  ```
  Backend Engineer
  API Developer
  Node.js Developer
  Server-Side Developer
  ```

Ou diretamente no banco (para automação):

```sql
-- Inserir trilha
INSERT INTO public.career_tracks (key, name, is_active)
VALUES ('backend', 'Backend Engineer', true);

-- Inserir variantes de cargo
INSERT INTO public.track_role_variants (track_id, role_title, sort_order)
SELECT id, unnest(ARRAY[
  'Backend Engineer',
  'API Developer',
  'Node.js Developer',
  'Server-Side Developer'
]), generate_subscripts(ARRAY[1,2,3,4], 1) - 1
FROM public.career_tracks WHERE key = 'backend';
```

---

## Passo 2 — Adicionar skills e pesos baseline

Cada skill da trilha tem um `baseline_weight` (0–100) que representa a importância
relativa no cálculo de aderência. O peso é combinado com a demanda real de vagas.

```sql
-- Identificar IDs das skills (já devem existir em public.skills)
-- Se a skill não existe, crie-a primeiro:
INSERT INTO public.skills (canonical_name, slug, category_id)
VALUES ('Docker', 'docker', <uuid-da-categoria>)
ON CONFLICT (slug) DO NOTHING;

-- Associar skills à trilha com pesos
INSERT INTO public.track_skill_baselines (track_id, skill_id, baseline_weight, required_level)
SELECT
  t.id,
  s.id,
  weight,
  'intermediario'
FROM public.career_tracks t
CROSS JOIN (VALUES
  ('docker',       80),
  ('kubernetes',   70),
  ('linux',        65),
  ('git',          60),
  ('python',       55),
  ('bash',         50)
) AS v(slug, weight)
JOIN public.skills s ON s.slug = v.slug
WHERE t.key = 'backend';
```

### Dica: required_level

| Valor | Significado |
|---|---|
| `iniciante` | A pessoa já ouviu falar |
| `intermediario` | Usa no dia a dia com supervisão |
| `avancado` | Produz sem supervisão |
| `especialista` | Referência no assunto |

---

## Passo 3 — Seed de certificações e cursos (opcional, recomendado)

Adicione entradas em `certifications_catalog` e `courses_catalog` referenciando o `track_id` da nova trilha:

```sql
INSERT INTO public.certifications_catalog (
  name, issuer, level, track_ids, skill_ids, official_url, cost_usd,
  exam_duration_min, validity_months, difficulty
)
SELECT
  'AWS Certified Developer',
  'Amazon Web Services',
  'Associate',
  ARRAY[t.id],
  ARRAY[]::uuid[],
  'https://aws.amazon.com/certification/certified-developer-associate/',
  300,
  130,
  36,
  'intermediario'
FROM public.career_tracks t WHERE t.key = 'backend';
```

---

## Passo 4 — Forçar reprocessamento de vagas

Após adicionar variantes de cargo, vagas antigas com esses títulos não terão `track_id` preenchido.
Execute:

```sql
-- Limpar track_id das vagas com título que bate com as novas variantes
UPDATE public.job_postings jp
SET track_id = NULL
FROM public.track_role_variants trv
JOIN public.career_tracks ct ON ct.id = trv.track_id AND ct.key = 'backend'
WHERE jp.title ILIKE '%' || trv.role_title || '%'
  AND jp.track_id IS NULL;
```

Depois acesse **Admin → Fontes → Rodar ingestão** (ou aguarde o próximo ciclo do pg_cron)
para que o pipeline de ingestão atribua `track_id` às vagas correspondentes.

---

## Passo 5 — Refreshar materialized views

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_tool_ranking;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_salary_stats;
```

Ou pelo endpoint de cron: `POST /api/public/refresh-market-views` (com o header `x-cron-secret`).

---

## Verificação

1. Acesse **Admin → Trilhas** — a nova trilha deve aparecer com a contagem de skills e vagas.
2. Acesse **Admin → Saúde** — verifique se as views foram refreshadas.
3. No onboarding, selecione a nova trilha e confirme que o dashboard de gap carrega.

---

## Invariantes que nunca devem ser violados

- Nenhum componente React tem `if (track === 'backend')` ou similar.
  O código lê `career_tracks` do banco e renderiza qualquer trilha dinamicamente.
- `market_segment` é sempre `'br'` ou `'remoto_global'`. Nunca misturar.
- RLS deve cobrir qualquer nova tabela com `auth.uid() = user_id`.
