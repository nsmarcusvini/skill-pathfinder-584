# Parada total do RUMVIA

> Decidido em 2026-09-13: parar ingestão, cobrança automática e o site.
> Tudo aqui é **reversível**. Nada manda apagar projeto, banco ou deploy.
>
> Estado no momento da decisão: 4.236 vagas, 36 perfis, 6 contas permanentes,
> **0 assinantes ativos**. Ninguém é prejudicado pela parada — não há cliente
> pagante para deixar sem acesso.

## A ordem importa

**Desagende os crons ANTES de pausar o Supabase.** Projeto pausado não roda
SQL: se o banco cair primeiro, você perde a única janela de desarmar o
`pg_cron`, e no dia em que despausar o domingo seguinte volta a cobrar a Bright
Data sozinho.

---

## Passo 1 — Desarmar os crons (Supabase SQL Editor)

Cole e rode o conteúdo de
[`supabase/migrations/20260913234500_parada_total_por_custo.sql`](../supabase/migrations/20260913234500_parada_total_por_custo.sql).

Confira com:

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

**Tem que voltar vazio.** Se sobrar qualquer linha, o desarme não funcionou —
não siga para o passo 2 antes de resolver, ou o cron volta junto com o banco.

## Passo 2 — Tirar o site do ar (Vercel)

Projeto `skill-pathfinder-584`, domínio `www.rumvia.com.br`.

A opção mais reversível, na ordem de preferência:

1. **Project Settings → General → Pause Project**, se o seu plano oferecer.
   Mantém deploy, domínio, variáveis de ambiente e histórico; só para de
   servir.
2. Se não houver pausa: **Settings → Domains**, remover `www.rumvia.com.br` e
   `rumvia.com.br`. O deploy continua vivo na URL `.vercel.app`, e o domínio
   volta com dois cliques.
3. **Settings → Git**, desconectar o repositório, para que nenhum push futuro
   gere deploy novo por acidente.

**Não delete o projeto.** Deletar leva junto as variáveis de ambiente —
incluindo a `ASAAS_API_KEY`, que tem aquele detalhe do `$` que precisa de aspas
duplas e escape para não chegar vazia (ver `docs/PAGAMENTOS.md`). Recriar isso
do zero é a parte cara de voltar.

## Passo 3 — Pausar o banco (Supabase)

**Project Settings → General → Pause project.**

Para o compute. Os dados continuam lá e voltam no despause.

> Atenção ao prazo do plano gratuito: projeto pausado por tempo prolongado pode
> ser elegível a remoção pelo próprio Supabase. Confirme a política vigente na
> tela de pausa **antes de confirmar** — se houver prazo, anote na agenda.
> Se a parada for longa, faça um backup antes:
> Database → Backups, ou `pg_dump` pela connection string.

## Passo 4 — Opcional: silenciar o Asaas

Com 0 assinantes não chega evento nenhum, então isto é higiene, não economia.
No painel do Asaas, desative o webhook que aponta para
`https://www.rumvia.com.br/api/public/asaas-webhook` — sem isso ele vai tentar
entregar, falhar e reenviar contra um domínio que não responde mais.

---

## O que continua custando mesmo assim

- **O domínio `rumvia.com.br`.** Registro é anual e não se pausa.
- **Nada mais.** Asaas cobra por transação (zero transações = R$ 0), a Resend
  só envia no cadastro, e a Bright Data só é cobrada pela fase `disparar`, que
  o passo 1 desarmou.

---

## O caminho de volta

Na ordem inversa, com uma regra que não pode ser quebrada:

1. Despausar o Supabase.
2. **Religar PRIMEIRO os crons de cobrança** — `rumvia-finaliza-cancelamentos`
   e `rumvia-expira-avisa-pix`. Eles voltam **antes** de o checkout receber a
   primeira venda. Se alguém assinar com esses dois parados, um pedido de
   cancelamento não é efetivado, o cliente é cobrado de novo e vira reembolso
   ou chargeback.
3. Religar `rumvia-purge-anon` junto com a landing — a promessa de apagar o CV
   em 7 dias volta a valer no instante em que a tela volta ao ar. Se a parada
   tiver sido longa, rodar `SELECT public.purge_inactive_anonymous();` uma vez,
   na mão, para zerar o que ficou acumulado — é a mesma função que o cron
   chamava.
4. Religar os quatro de manutenção (`expire-jobs`, `refresh-market-views`,
   `notify-certs`, `expurga-trilha-de-uso`).
5. Devolver o domínio na Vercel.
6. **A ingestão é a ÚLTIMA, e é opcional.** Antes de reagendá-la:
   - conferir se `app_settings.app_base_url` ainda aponta para o **www** — o
     apex responde 308 e `net.http_post` não segue redirect, então a coleta
     voltaria como no-op silencioso;
   - para não pagar nada à Bright Data, baixar `limit_per_input` para 35 em
     `job_sources.config` (3 fontes × 10 inputs × 35 = 1.050 por disparo,
     dentro dos 5.000/mês do plano gratuito).

   Os três `cron.schedule(...)` originais estão em
   `supabase/migrations/20260909180000_cron_ingestao_semanal.sql` e podem ser
   copiados de lá sem alteração.

---

## O que NÃO foi feito, e continua pendente

A base de vagas **envelhece parada**. Quando o produto voltar, o gap vai ser
calculado sobre vagas antigas até a primeira ingestão rodar — e `expire-jobs`,
também parado, não vai ter marcado nenhuma como inativa nesse meio-tempo.
Rodar uma ingestão manual (`bun run scripts/ingest.ts`) antes de reabrir para
o público.
