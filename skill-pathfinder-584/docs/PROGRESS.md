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
