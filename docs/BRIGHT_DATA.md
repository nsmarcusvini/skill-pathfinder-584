# Coleta de vagas via Bright Data

Integração com a Web Scraper API da Bright Data para LinkedIn Jobs, Indeed e
Glassdoor Jobs.

## Status atual (2026-08-27)

- `BRIGHT_DATA_API_KEY` gravada no `.env` do servidor.
- `bd_linkedin_jobs`, `bd_indeed`, `bd_glassdoor` ativas em `job_sources`, com
  `dataset_id` real (obtido no painel do cliente) e `discover_inputs` cobrindo
  as três trilhas ativas (`devops`, `data_engineer`, `fullstack`).
- **Falta**: `app_settings.app_base_url`. Sem ele, o cron `rumvia-ingest-async`
  (e também `rumvia-ingest-jobs`, das 12 fontes síncronas) faz `WHERE ... <> ''`
  e não dispara nada — é um no-op silencioso, não um erro. Definir com:
  ```sql
  update public.app_settings set value = jsonb_build_object('url', 'https://SEU-DOMINIO')
  where key = 'app_base_url';
  ```
- LinkedIn Posts (`gd_lyy3tktm25m4avu764`) **não tem adapter**: o pipeline de
  classificação de posts depende de LLM, e a regra 2 do CLAUDE.md proíbe LLM no
  MVP. Fica parado até essa decisão.

## O que a Bright Data oferece de fato

Verificado na documentação oficial em 2026-08-27:

| Fonte | Situação |
|---|---|
| LinkedIn Jobs | Disponível. Descoberta por keyword ou URL de busca |
| Indeed | Disponível |
| Glassdoor Jobs | Disponível |
| LinkedIn Posts | Disponível. Descoberta por empresa ou perfil |
| **JobGether** | **Não existe.** Sem dataset, scraper ou entrada no catálogo |

O adapter do JobGether fica registrado e desativado, com o motivo explícito, no
mesmo padrão de `adzuna`/`jsearch`. Habilitá-lo depois exigiria API própria,
feed ou acordo direto com a fonte — nunca scraping por fora (CLAUDE.md, regra 9).

### O que a API não oferece

**Não há mecanismo documentado de coleta incremental.** O parâmetro
`type=discover_new` é modo de *descoberta*, não sincronização de deltas: ele não
devolve "só o que mudou desde a última coleta". Novo, atualizado e expirado são
detectados do nosso lado, comparando com o que já está no banco.

## Como a coleta funciona

A API é assíncrona:

```
POST /datasets/v3/trigger?dataset_id=...   ->  { snapshot_id }
GET  /datasets/v3/progress/{snapshot_id}   ->  { status }
GET  /datasets/v3/snapshot/{snapshot_id}   ->  registros
```

Status possíveis: `starting`, `running`, `ready`, `failed`, `canceled`.

Isso não cabe no contrato `JobAdapter.fetchJobs()`, que é síncrono e devolve as
vagas numa chamada. Esperar em polling lá dentro bloquearia a execução,
estouraria timeout e perderia tudo se o processo caísse.

Por isso existe o contrato `AsyncJobAdapter`, com duas fases duráveis:

```
dispararColetas()          fase 1: pede a coleta, grava provider_snapshots
        ↓
   (minutos depois)
        ↓
colherSnapshots()          fase 2: consulta; se ready, baixa e ingere
        ↓
pipeline.server.ts         MESMO pipeline das outras 12 fontes
        ↓
normalização → classificação → dedupe → upsert → extração de skills
```

O estado fica em `provider_snapshots`. Duas consequências:

- **Durabilidade**: se o processo cair entre disparo e colheita, o snapshot
  continua registrado e a próxima execução o encontra.
- **Idempotência**: um snapshot só é ingerido uma vez — vira `ingested` e sai do
  filtro de pendentes. Somado ao upsert por `(source_id, external_id)` do
  pipeline, recoletar a mesma vaga atualiza em vez de duplicar.

## Configuração

### Credencial

Só variável de ambiente do servidor (CLAUDE.md, regra 8). Nunca no `.env`
versionado — este repositório é público.

```env
BRIGHT_DATA_API_KEY=          # obrigatória
BRIGHT_DATA_TIMEOUT_MS=30000  # opcional, por requisição
BRIGHT_DATA_MAX_RETRIES=4     # opcional
BRIGHT_DATA_MAX_POLLS=60      # opcional, antes de abandonar um snapshot
BRIGHT_DATA_SNAPSHOT_TTL_HOURS=24
```

### `dataset_id`

**Não está no código, e não deve estar.** Cada `gd_...` é específico da conta.
Para obter: painel em `brightdata.com/cp/datasets` → escolha o scraper → aba
*API Request Builder* → o id já vem preenchido na requisição de exemplo.

Grave em `job_sources.config`:

```sql
update public.job_sources
set config = config || jsonb_build_object('dataset_id', 'gd_SEU_ID_AQUI'),
    is_active = true,
    error_message = null
where key = 'bd_linkedin_jobs';
```

### O que buscar

Também em `job_sources.config`, para cada instalação buscar o que lhe interessa:

```jsonc
{
  "dataset_id": "gd_...",
  "discover_inputs": [
    { "keyword": "devops", "location": "Brazil" },
    { "keyword": "site reliability engineer", "location": "Brazil" }
  ],
  "limit_per_input": 50,   // teto por entrada: controla custo
  "country": "BR"
}
```

## Sobre o mapeamento de campos

Os nomes de campo variam por dataset e por versão, e não são publicados de forma
estável. O mapeamento em `adapters/bright-data.ts` é **tolerante**: procura o
valor entre vários nomes plausíveis e cai para `null` quando não encontra.

O registro cru inteiro é preservado em `NormalizedJob.raw` e gravado em
`job_posting_raw`. Isso é deliberado: quando você tiver dados reais da sua
conta, dá para refinar o mapeamento olhando o que veio, **sem recoletar nada**.

Preferir `null` a inventar um campo que talvez não exista é regra aqui.

### Taxonomia de tecnologias

Linguagens, cloud, frameworks, bancos e ferramentas DevOps **não viraram colunas**.
Isso já é modelado por `job_posting_skills` + `skills.category_id` →
`skill_categories`, que tem exatamente essas categorias. Duplicar quebraria o
matcher único (regra 4).

## Adicionar uma fonte nova

1. Implemente `AsyncJobAdapter` (ou `JobAdapter`, se a fonte for síncrona) em
   `src/lib/ingest/adapters/`.
2. Registre em `ASYNC_ADAPTERS` (ou `ADAPTERS`) em `adapters/index.ts`.
3. **Migration** para estender o CHECK de `job_sources.adapter` — a lista é
   fechada de propósito, para pegar cadastro de fonte cujo adapter não existe.
4. `INSERT` em `job_sources` com a config, começando `is_active = false`.
5. Teste com fixtures, sem depender do provedor.

## Testes

```bash
bun test src/lib/ingest/adapters/bright-data.test.ts
```

Cobrem mapeamento, campos alternativos, descarte de registro incompleto,
linhas de erro do `include_errors`, dedução de remoto, salário como texto,
data em epoch, idempotência do `external_id`, e as três recusas de configuração
(sem credencial, sem `dataset_id`, sem `discover_inputs`).

Não tocam na rede: as fixtures imitam a forma dos registros. Elas **não** são
cópias de resposta real — garantem o comportamento do mapeamento, não a forma
exata da resposta da Bright Data.

## Deduplicação entre fontes

A mesma vaga aparece sindicalizada em LinkedIn, Indeed e Glassdoor ao mesmo
tempo. Sem tratamento, ela entraria três vezes e inflaria a demanda das
skills dela — o número que o produto vende.

A regra inteira vive na função SQL `dedupe_job_postings()` (migration
`20260827190000_cross_source_dedupe.sql`): agrupa por empresa + título
normalizado + segmento + proximidade temporal (30 dias), exige fontes
diferentes no grupo, e elege uma canônica por tier da fonte (A = ATS próprio >
B = agregador > C = paga) e riqueza da descrição. As demais ganham
`canonical_job_id` apontando para a vencedora e saem de toda matview e RPC de
mercado — mas continuam na tabela, com seu próprio `apply_url`.

Chamada em três pontos, todos passando pelo mesmo `dedupeJobPostings()` em
`pipeline.server.ts`:

1. `run.server.ts` — depois de `deactivateStaleJobs()`, no fim do fluxo pull.
2. `bright-data.server.ts` — no fim de `colherSnapshots()`, só se algum
   snapshot foi de fato ingerido.
3. `refresh_market_views()` — rede de segurança: nenhuma matview recalcula
   sobre dado duplicado, mesmo por um caminho que ainda não chama a dedupe
   diretamente.

Idempotente e autocurativa: rodar sem dado novo não altera nada, e uma vaga
canônica que expira (`is_active = false`) libera a duplicata sobrevivente na
próxima execução, em vez de apagar a demanda da base.

## Custo

Cada entrada em `discover_inputs` multiplica por `limit_per_input`. Três fontes
× duas keywords × 50 = até 300 registros por ciclo. `provider_snapshots` guarda
`records_downloaded` por lote, que é a base para acompanhar consumo.

O disparo é bloqueado enquanto houver lote da mesma fonte em andamento — evita
pagar duas vezes pela mesma coleta.
