# Prompt 15 — Tour guiado pós-cadastro

> **Implementado em 2026-08-30.** Este documento é o registro do plano; o que
> mudou na execução está anotado em `docs/PROGRESS.md` (Prompt 15) — em especial
> o backfill, que precisou de uma segunda migration, e o bug de persistência do
> passo, encontrado só ao rodar de verdade.
> Parte A é o prompt reescrito. Parte B é o plano técnico.

---

## Antes de tudo: três coisas que o prompt original assume errado

1. **A rota não é `/meu-cv`.** O arquivo é `src/routes/_conta/cv.tsx` → URL `/cv`.
   "Meu CV" é só o **label** do menu (`account-shell.tsx:32`). Um tour que tente
   ancorar ou navegar em `/meu-cv` quebra silenciosamente.

2. **"Onboarding" já existe e é outra coisa.** `src/routes/onboarding.tsx` é o
   **wizard de configuração** (trilha → senioridade → segmento → CV) e grava
   `profiles.onboarding_completed`. O que você está pedindo é um **tour guiado**
   (coach marks) que roda *depois* dele. Se os dois se chamarem "onboarding", o
   próximo agente vai confundir os estados. Neste documento o recurso novo se
   chama **tour** em todo lugar — código, coluna e copy.

3. **"Ao logar" e "somente após o cadastro pela primeira vez" se contradizem.**
   Adotei a segunda leitura, que é a correta do ponto de vista de produto: o tour
   dispara **uma vez**, na primeira entrada no `/dashboard` depois do cadastro e
   do wizard concluídos. Não em todo login. Quem já é usuário hoje **não** deve
   ver o tour — a migration faz o backfill disso.

---

# PARTE A — Prompt reescrito

> Cole isto como prompt. Ele já carrega as decisões e as restrições do projeto.

```text
Implemente o Prompt 15 — Tour guiado pós-cadastro. Leia CLAUDE.md antes; as
regras 1, 6, 10 e 11 se aplicam.

OBJETIVO
Na primeira vez que um usuário com conta permanente entra no /dashboard depois de
concluir o wizard de /onboarding, um tour guiado apresenta o produto: uma sequência
de pop-ups ancorados no menu lateral, um por seção, explicando o que cada tela
significa e quando usá-la. Ao final o tour se encerra e nunca mais aparece
sozinho — mas pode ser reexecutado manualmente em /conta.

NÃO CONFUNDIR com o /onboarding existente (wizard de trilha/senioridade/segmento,
gravado em profiles.onboarding_completed). O tour é um recurso novo e independente,
que roda DEPOIS dele. Use o prefixo `tour` em coluna, componente, hook e copy.

GATILHO (as três condições, todas verdadeiras)
  - isAuthenticated === true  (conta permanente; anônimo nunca vê o tour)
  - profile.onboarding_completed === true
  - profile.tour_status === 'pendente'
Dispara só dentro do segmento /_conta, montado no AccountShell. Nunca dispara em
rota pública, nem durante o `loading` do useAuth, nem antes do perfil carregar.

PERSISTÊNCIA — no banco, não em localStorage
Migration nova em supabase/migrations/ com timestamp de hoje, adicionando a
public.profiles:
  tour_status  text NOT NULL DEFAULT 'pendente'
               CHECK (tour_status IN ('pendente','em_andamento','concluido','pulado'))
  tour_step    smallint NOT NULL DEFAULT 0
  tour_updated_at timestamptz
Backfill obrigatório na mesma migration: todo perfil que já existe vira
'concluido' (UPDATE public.profiles SET tour_status = 'concluido'), senão a base
inteira recebe o tour no próximo login. As policies de profiles já cobrem
(profiles_update_own) — não crie policy nova, mas confirme lendo a migration
20260826145125_*.sql. Depois de aplicar, regenere src/integrations/supabase/types.ts.
Motivo de ser no banco e não em localStorage: o user.id sobrevive à conversão
anônimo→permanente (regra 7) e o usuário troca de dispositivo.

PASSOS (14, nesta ordem)
  1.  Boas-vindas — card centrado, sem âncora
  2.  Trilha + Segmento (seletores da topbar)  ← âncora no header, não no menu
  3.  Dashboard        /dashboard
  4.  Meu CV           /cv          (ATENÇÃO: a URL é /cv, o label é "Meu CV")
  5.  Minhas skills    /minhas-skills
  6.  Vagas            /vagas
  7.  Ferramentas      /ferramentas
  8.  Empresas         /empresas
  9.  Salários         /salarios
  10. Progresso        /progresso
  11. Certificações    /certificacoes
  12. Cursos           /cursos
  13. Conta            /conta
  14. Encerramento — card centrado, CTA "Começar pelo meu CV" → /cv
A copy de cada passo está na seção "Copy dos passos" de
docs/roadmap/prompt-15-tour-guiado.md. Use exatamente ela.

COMPORTAMENTO
  - O tour NÃO navega entre rotas. O usuário fica no /dashboard e os pop-ups
    percorrem os itens do menu lateral, destacando um de cada vez.
  - Controles: "Voltar", "Próximo", "Pular tour" (fecha e grava 'pulado'),
    Esc = pular, contador "4 de 14", barra de progresso.
  - Cada avanço grava tour_step (com debounce; não faça 14 round-trips
    bloqueantes). Recarregar a página no meio retoma do passo salvo.
  - Fim (passo 14 concluído ou "Pular"): grava o status final + tour_updated_at,
    invalida a query ["profile", userId], desmonta o overlay.
  - O item do menu destacado não fica clicável enquanto o tour roda: o clique é
    capturado pelo overlay e só avança o passo.

MOBILE (< md) — o menu lateral não existe e a bottom nav só mostra 5 dos 11 itens
Não tente ancorar. Renderize os mesmos 14 passos num Drawer (vaul, já é
dependência) ancorado no rodapé: ícone + título + texto + os mesmos controles.
Use o hook use-mobile.tsx que já existe para escolher a apresentação.

REEXECUÇÃO
Em /conta, um botão "Rever tour guiado" que grava tour_status='pendente',
tour_step=0 e navega para /dashboard.

RESTRIÇÕES
  - NÃO instale biblioteca de tour (react-joyride, driver.js, shepherd, intro.js).
    Elas trazem CSS próprio com border-radius e paleta que brigam com o Design
    System (regra 11: cantos retos, hairlines, tokens de design-tokens.ts).
    Construa sobre Radix Popover, que já está no package.json.
  - Zero hex solto. Cor só de src/lib/design-tokens.ts ou das classes do DS.
  - Não edite src/components/ui/* (shadcn gerado). O componente novo vai em
    src/components/rumvia/tour.tsx e é exportado por rumvia/index.ts.
  - Nenhum texto do tour pode citar trilha específica (regra 1): nada de
    "veja suas skills de DevOps". A copy é agnóstica de trilha.
  - Interface em pt-BR (regra 10).
  - Acessibilidade: role="dialog" + aria-modal, foco preso no card, foco
    devolvido ao elemento de origem ao fechar, aria-live="polite" anunciando o
    passo, navegação por teclado (Tab/Shift+Tab, Esc) e prefers-reduced-motion
    desligando as transições.

ENTREGA
  - Rode `bun run lint` e `npx tsc --noEmit` — os dois têm que passar com 0 erro.
  - Verifique no preview: crie uma conta de teste, conclua o wizard, confirme que
    o tour dispara uma vez, que sobrevive a um F5 no meio e que NÃO volta no
    login seguinte. Confirme também que uma conta antiga (backfill) não vê nada.
  - Atualize docs/PROGRESS.md com a linha do Prompt 15.
```

---

# PARTE B — Plano técnico

## B.1 Decisões, com o porquê

| Decisão | Escolha | Motivo |
|---|---|---|
| Nome | `tour`, nunca `onboarding` | `onboarding_completed` já significa "wizard concluído". Dois conceitos com um nome só é bug garantido. |
| Biblioteca | Nenhuma. Radix Popover, que já é dependência. | react-joyride/driver.js injetam CSS com raio, sombra e paleta próprios. O DS RUMVIA é `border-radius: 0` + hairline + Barlow. Sobrescrever o CSS deles dá mais trabalho que as ~200 linhas do componente próprio, e viola a regra 11 no caminho. |
| Onde persiste | 3 colunas em `profiles` | `localStorage` some ao trocar de navegador e não sobrevive ao fluxo anônimo→permanente. Tabela nova seria exagero para 3 campos 1:1 com o perfil. |
| Navega entre rotas? | **Não** | 11 rotas × dados carregando × remount do `Outlet` = âncora que some no meio do passo. E o pedido — "o que significa cada seção" — é exatamente o que o menu lateral já enumera. Ancorar no menu é estável: a `<aside>` é `sticky` e não remonta. |
| Onde monta | `AccountShell` | Único ponto que envolve as 11 rotas `_conta/*` e contém o menu, que são as âncoras. |
| Mobile | Drawer, sem âncora | A bottom nav renderiza `nav.slice(0, 5)` — 6 dos 11 itens não existem no DOM em telas pequenas. Ancorar seria impossível para metade dos passos. |

## B.2 Risco de UX que vale registrar

14 pop-ups seguidos é muito. A taxa de conclusão de tours desse tamanho é baixa e
o usuário costuma clicar em "Pular" lá pelo passo 3. Entrego como pedido, mas com
três mitigações embutidas: copy de no máximo duas linhas por passo, contador
"4 de 14" visível desde o primeiro card (o usuário sabe onde é o fim) e "Pular
tour" sempre presente. Se depois quiser encurtar, o corte natural é agrupar 7–8
(Ferramentas + Empresas) e 11–12 (Certificações + Cursos), caindo para 12 passos.

## B.3 Arquivos

**Novos**

```
supabase/migrations/2026MMDDHHMMSS_tour_guiado.sql
src/components/rumvia/tour.tsx          # overlay + card + Drawer mobile
src/lib/tour-steps.ts                   # os 14 passos (dado, não JSX)
src/hooks/use-tour.tsx                  # estado, gatilho, persistência
```

**Alterados**

```
src/components/rumvia/app-shell.tsx     # NavItem ganha `tourId?`; data-tour nos <Link>
                                        # e nos dois <select> da topbar
src/components/rumvia/index.ts          # exporta Tour
src/components/app/account-shell.tsx    # tourId em cada item do NAV; monta <Tour/>
src/routes/_conta/conta.tsx             # botão "Rever tour guiado"
src/integrations/supabase/types.ts      # regenerado após a migration
docs/PROGRESS.md                        # linha do Prompt 15
```

## B.4 Migration (esboço)

```sql
-- Prompt 15: estado do tour guiado
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tour_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS tour_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tour_updated_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_tour_status_chk
    CHECK (tour_status IN ('pendente','em_andamento','concluido','pulado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: quem já usa o produto não recebe o tour.
UPDATE public.profiles SET tour_status = 'concluido' WHERE tour_status = 'pendente';
```

Nenhuma policy nova: `profiles_update_own` (`FOR UPDATE ... auth.uid() = id`) já
autoriza o próprio usuário a gravar as colunas. Perfis criados depois da migration
nascem com o default `'pendente'` pelo trigger `handle_new_user`.

## B.5 API do componente

```ts
// src/lib/tour-steps.ts
export type TourStep = {
  id: string;
  /** Casa com data-tour="..." no DOM. Ausente = card centrado, sem âncora. */
  anchor?: string;
  title: string;
  body: string;
  /** Só informativo, para o ícone do passo na variante mobile. */
  icon?: React.ReactNode;
};
export const TOUR_STEPS: TourStep[] = [ /* 14 itens */ ];
```

```ts
// src/hooks/use-tour.tsx
{
  active: boolean;
  step: number;          // 0-based
  total: number;
  current: TourStep | null;
  next(): void;
  back(): void;
  skip(): void;          // grava 'pulado'
  finish(): void;        // grava 'concluido'
  restart(): void;       // usado pelo botão em /conta
}
```

Âncoras a acrescentar no `app-shell.tsx`: `tour-topbar-filtros`,
`tour-nav-dashboard`, `tour-nav-cv`, `tour-nav-minhas-skills`, `tour-nav-vagas`,
`tour-nav-ferramentas`, `tour-nav-empresas`, `tour-nav-salarios`,
`tour-nav-progresso`, `tour-nav-certificacoes`, `tour-nav-cursos`,
`tour-nav-conta`.

Posicionamento: `getBoundingClientRect()` do elemento com o `data-tour`,
recalculado em `resize` e `scroll` (ResizeObserver na `<aside>`). Se a âncora não
existir no DOM (menu recolhido, item ausente), o passo degrada para card centrado
em vez de sumir.

## B.6 Copy dos passos (pt-BR, agnóstica de trilha)

| # | Âncora | Título | Texto |
|---|---|---|---|
| 1 | — | Bem-vindo ao RUMVIA | Em menos de um minuto você vai saber o que tem em cada tela. Pode pular a qualquer momento. |
| 2 | `tour-topbar-filtros` | Trilha e segmento | Estes dois seletores mandam em tudo. A trilha define contra qual carreira você é comparado; o segmento separa vagas do Brasil (em BRL) das remotas globais (em USD). Os números nunca misturam os dois. |
| 3 | `tour-nav-dashboard` | Dashboard | Seu painel: a aderência em % à trilha escolhida, as lacunas mais caras, empresas contratando e a mediana salarial do recorte. É a resposta curta de "quão perto eu estou". |
| 4 | `tour-nav-cv` | Meu CV | Envie seu currículo em PDF. O RUMVIA lê e extrai suas skills automaticamente — é daqui que sai toda a análise. |
| 5 | `tour-nav-minhas-skills` | Minhas skills | O que foi extraído do CV, com o nível de cada skill. Ajuste o que ficou errado e adicione o que faltou: cada correção recalcula sua aderência. |
| 6 | `tour-nav-vagas` | Vagas | Vagas reais coletadas das empresas, com filtro de busca, cidade, remoto e faixa salarial. Cada vaga mostra quais skills exigidas você já tem e quais faltam. |
| 7 | `tour-nav-ferramentas` | Ferramentas | O ranking do que o mercado realmente pede na sua trilha. Dá para comparar duas ferramentas, ver quais aparecem juntas nas mesmas vagas e mandar uma direto para o plano de estudos. |
| 8 | `tour-nav-empresas` | Empresas | Quem está contratando no seu recorte, ordenável por volume de vagas. Siga uma empresa para acompanhar as aberturas e ver o quanto seu perfil combina com ela. |
| 9 | `tour-nav-salarios` | Salários | Faixas por senioridade, Brasil × remoto global, e o impacto de cada skill no salário — inclusive quanto você deixa na mesa pelas que faltam. Tem simulador, e você pode contribuir com sua faixa, sempre de forma anônima. |
| 10 | `tour-nav-progresso` | Progresso | Seu plano de estudos em quadro kanban, gerado a partir das suas lacunas. Registre as horas e acompanhe a sequência de dias no mapa de calor. |
| 11 | `tour-nav-certificacoes` | Certificações | Catálogo de certificações ordenado pelo impacto que cada uma teria na sua aderência. Marque as que já tem e planeje as próximas. |
| 12 | `tour-nav-cursos` | Cursos | Cursos filtrados por formato, preço e idioma, com barra de progresso. Também entram no plano de estudos com um clique. |
| 13 | `tour-nav-conta` | Conta | Seus dados, a troca de trilha e senioridade, e o controle da sua privacidade: exportar tudo em JSON ou apagar a conta. |
| 14 | — | Pronto | O tour acabou. O próximo passo que mais muda seu resultado é enviar o CV — é ele que alimenta todas as telas. |

*(O passo 14 traz o CTA "Começar pelo meu CV" → `/cv` e um secundário "Fechar".)*

## B.7 Ordem de execução

1. Migration + backfill; aplicar; regenerar `types.ts`.
2. `tour-steps.ts` (dado puro, sem UI).
3. `use-tour.tsx` — gatilho e persistência, ainda sem visual; validar por `console`.
4. `tour.tsx` — overlay, card ancorado, recorte do destaque, foco e teclado.
5. `data-tour` no `app-shell.tsx` + `tourId` no `NAV` do `account-shell.tsx`.
6. Variante mobile (Drawer) atrás do `use-mobile`.
7. Botão "Rever tour guiado" em `/conta`.
8. Lint, `tsc --noEmit`, verificação no preview, `PROGRESS.md`.

Do 1 ao 5 já dá um tour funcional em desktop — é um ponto de parada válido se
você quiser revisar antes do resto.

## B.8 Critérios de aceite

- [ ] Conta nova: cadastro → wizard → `/dashboard` abre com o passo 1.
- [ ] Conta existente (backfill): nenhum pop-up, em nenhum login.
- [ ] Visitante anônimo: nenhum pop-up (e ele nem alcança `/_conta`).
- [ ] Segundo login da conta nova: nenhum pop-up.
- [ ] F5 no passo 7 retoma no passo 7.
- [ ] "Pular tour" no passo 2 encerra e não volta.
- [ ] Esc encerra igual ao "Pular".
- [ ] Os 12 passos ancorados encontram sua âncora com o menu expandido; com o menu
      recolhido nenhum passo some (degrada para centrado).
- [ ] Em 375px de largura os 14 passos aparecem no Drawer, incluindo os 6 que não
      cabem na bottom nav.
- [ ] "Rever tour guiado" em `/conta` reinicia do passo 1.
- [ ] O teclado sozinho percorre o tour inteiro; leitor de tela anuncia cada passo.
- [ ] `bun run lint` e `npx tsc --noEmit`: 0 erro.
- [ ] Nenhum hex literal no código novo; nenhum arquivo de `src/components/ui/` tocado.

## B.9 Fora de escopo

- Tour por rota (passos ancorados em elementos *dentro* de cada tela).
- Tours contextuais de recurso ("novidade nesta tela").
- Telemetria de funil (em que passo o usuário abandona).
- Tour para a área `/admin`.
