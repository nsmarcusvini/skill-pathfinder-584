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

- [x] **Tour guiado agora cobre o primeiro acesso ao site, não só a conta.**
      O tour pós-cadastro (14→15 passos) já existia pronto — o que faltava era o
      visitante anônimo (`/`) e um defeito de segurança no gate existente:
      - **Fix:** `useTour` (`src/hooks/use-tour.tsx`) não checava `canAccess` —
        assinatura vencida com tour `em_andamento` abria o overlay bloqueando o
        próprio botão "Assinar agora" em `/assinatura`. Corrigido incluindo
        `canAccess` (de `useSubscription`) na condição `eligible`.
      - **Passo novo:** "Assinatura" entrou no tour da conta, entre Cursos e Conta
        (`tour-nav-assinatura` no NAV de `account-shell.tsx` + passo em
        `tour-steps.ts`). Total passou de 14 para 15 passos — `tour.total` é
        derivado do array, nada mais precisou mudar.
      - **Tour da landing (novo):** `src/hooks/use-landing-tour.tsx` +
        `src/lib/landing-tour-steps.ts` + `src/components/rumvia/landing-tour.tsx`.
        Mesma UI do tour da conta — extraí `TourOverlay` de
        `components/rumvia/tour.tsx` para ser reutilizável por qualquer
        controlador que implemente `UseTourReturn`. Estado em `localStorage`
        (chave `rumvia:tour-landing`), não no banco — sessão anônima é expurgada
        pelo cron `rumvia-purge-anon`, banco seria descartado junto.
      - **Nunca abre sozinho:** convite discreto "Ver tour de 40s" (canto inferior
        esquerdo) + gatilho automático só quando o visitante rola até
        `#como-funciona` (`IntersectionObserver`, uma vez). Overlay automático no
        primeiro segundo da landing derruba conversão.
      - 7 passos: boas-vindas → upload do CV → `#como-funciona` →
        `#funcionalidades` → `#planos` → `#faq` → fecho com CTA "Analisar meu CV"
        → `/analise`.
      - `TourStep` ganhou `finalCta?: { label, to, search? }` — o botão final do
        último passo agora vem do dado, não hardcoded no componente (tour da conta
        manda pra `/cv`, tour da landing manda pra `/analise`).
      - `TourOverlay`/`DesktopTour` ganharam `scroll`-listener + `scrollIntoView`
        na âncora do passo atual — necessário porque, ao contrário do menu lateral
        fixo da conta, as seções da landing entram e saem da viewport rolando.
      - Landing só monta `<LandingTour />` quando `!isAuthenticated` — cliente
        pagante que volta pra `/` não recebe o pitch de vendas.
      - Verificado ponta a ponta via DOM/localStorage no navegador (7 passos,
        `scrollIntoView` certo, destaque com padding exato, persistência de
        pulado/concluído, CTA final navegando e marcando `concluido`). O fix do
        gate (fase 1) não foi possível testar interativamente — exige conta com
        assinatura vencida — mas é uma mudança de uma condição, coberta por
        `tsc`/`eslint`.
