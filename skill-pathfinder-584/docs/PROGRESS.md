# RUMVIA — Progresso

## 2026-09-01

- [x] **"Gerar das minhas lacunas" não duplica mais plano a cada clique.**
      `generatePlanFromGap` (`src/lib/study.functions.ts`) agora reconhece o plano
      já gerado pra trilha atual (`study_plans.source = 'gap_generated'`, migration
      `20260901170000_study_plans_gap_source.sql`) e o botão em `_conta/progresso.tsx`
      se comporta assim:
      - 1º clique (nenhum plano gerado ainda pra trilha): cria o plano e avisa que é
        o primeiro.
      - Clique seguinte, plano já existe: abre `AlertDialog` perguntando **refazer do
        zero** (substitui os itens vindos de lacuna pelas 10 lacunas atuais) ou
        **adicionar só as novidades** (mantém os itens/progresso existentes, insere
        só lacunas novas por `skill_id`).
      - "Adicionar novidades" sem nada novo pra adicionar: toast "Não há mudanças".
      - Migration aplicada no projeto Supabase remoto (`rumvia`,
        `hskvwzkouhkwumzshbci`) como `20260901202053_study_plans_gap_source` — o
        arquivo local foi renomeado pra bater com a versão remota.
        `src/integrations/supabase/types.ts` foi regenerado via MCP (não é mais o
        patch manual da primeira versão desta feature).

- [x] **Tour guiado: fix do gate + passo de Assinatura.** O tour pós-cadastro
      (agora 15 passos) é o único "passo a passo de primeiro acesso" — dispara no
      primeiro login (pendente/em_andamento em `profiles.tour_status`), nunca fora
      do login. Chegou a existir uma versão com tour também para visitante anônimo
      na landing (`/`, antes do login); foi revertida a pedido — não fazia sentido
      guiar quem ainda nem entrou na conta.
      - **Fix:** `useTour` (`src/hooks/use-tour.tsx`) não checava `canAccess` —
        assinatura vencida com tour `em_andamento` abria o overlay bloqueando o
        próprio botão "Assinar agora" em `/assinatura`. Corrigido incluindo
        `canAccess` (de `useSubscription`) na condição `eligible`.
      - **Passo novo:** "Assinatura" entrou no tour da conta, entre Cursos e Conta
        (`tour-nav-assinatura` no NAV de `account-shell.tsx` + passo em
        `tour-steps.ts`). Total passou de 14 para 15 passos — `tour.total` é
        derivado do array, nada mais precisou mudar.
      - Não foi possível testar o fix do gate interativamente — exige conta com
        assinatura vencida — mas é uma mudança de uma condição, coberta por
        `tsc`/`eslint`.
