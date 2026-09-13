# Prompt 16 — CRO do funil de aquisição

> Documento executável. Quem pega esta tarefa não precisa ter participado da análise que a
> originou: tudo o que é necessário para implementar está aqui.
> **Leia `CLAUDE.md` antes.** As regras de lá vencem qualquer coisa escrita aqui.

## Objetivo

Aumentar a conversão do funil `visitante → upload de CV → cadastro → assinatura → ativação`
sem quebrar nenhuma das garantias do produto (honestidade dos números, paywall explícito,
LGPD, CDC). Nenhuma alteração aqui é estética: cada uma tem hipótese, métrica e critério
de sucesso.

O funil atual é:

```
landing (/) → /analise (upload + parse + gap, sem cadastro) → /cadastro (barrado sem CV)
→ /assinatura?bloqueado=1 → checkout externo Asaas → webhook → /onboarding → /dashboard
```

A ordem do funil está **correta** e não muda. O que muda é o atrito dentro de cada etapa.

---

## Linha de base medida (2026-09-10, `localhost:8100`)

Registre estes números antes de mexer em qualquer coisa — são o "antes" da comparação.

| Medida | Valor |
|---|---|
| Base | 4.236 vagas ativas · 207 skills · 4 trilhas ativas |
| Preço | R$ 29,90 mensal · R$ 80,70 trimestral · R$ 286,80 anual (a partir de R$ 23,90/mês) |
| Trial | nenhum — `trial_days` NULL nos três planos |
| Usuários | 36 perfis · 33 anônimos · 6 contas permanentes · 0 assinantes ativos |
| Instrumentação | só `@vercel/analytics` (pageview); zero eventos de funil |
| Landing | 13.389px desktop · 8.392px mobile |
| **Mobile 375×812** | H1 = 58px fixo, 241px de altura (30% da dobra) |
| | CTA do hero em y=546 |
| | botão "Selecionar arquivo" em y=964 — **152px abaixo da dobra** |
| | checkbox de consentimento em y=1074 |

---

## Restrições inegociáveis

Violar qualquer uma destas invalida a entrega inteira.

1. **Preço nunca vai para o JSX.** Vem de `billing_plans` via `usePublicPlans` /
   `useSubscription`. Ciclo, desconto e valor são derivados (regra 12 do `CLAUDE.md`).
2. **Trilha é dado, não código.** Nenhum `if (track === 'devops')`. Toda menção a trilha
   em texto sai de `landing_stats()` / `career_tracks`, como já faz `trilhasEmProsa`.
3. **Nunca inventar número.** Se o dado não carregou, o texto cai para uma versão sem
   número — nunca para um valor escrito à mão. Sem `<EmptyState>` falso, sem placeholder.
4. **A conta nunca é chamada de grátis.** Só a prévia é. A frase de bloqueio é
   `AVISO_ACESSO_PAGO` em `src/lib/plan-copy.ts` e é a mesma em todo o funil.
5. **Texto de plano e de garantia mora em `plan-copy.ts`.** Não duplicar string de
   `AVISO_ARREPENDIMENTO` / `PLANO_INCLUI` / `PREVIA_GRATUITA` em componente nenhum.
6. **PIX está suspenso até sair o CNPJ/MEI** (migration `20260910210000_suspende_pix_ate_mei`).
   Hoje só cartão. **Não reativar, não escrever copy que mencione PIX como disponível, não
   remover o código do PIX** — ele volta quando o CNPJ sair. Todo texto de método de
   pagamento continua derivando de `plano.methods`, nunca fixo.
7. **Senioridade vem do parser.** O nível do perfil é o que a detecção do CV devolveu.
   Nunca fixar "senior" (nem qualquer outro) como padrão de tela.
8. **Tour é pós-cadastro, dentro da área logada.** Nunca na landing, nunca antes do login.
9. **Design System (base Industry) é lei.** Cantos retos, hairlines, Barlow / Barlow
   Condensed, tokens de `src/lib/design-tokens.ts`. **Nenhum hex solto em componente.**
10. **Interface em pt-BR.**
11. **Não editar `src/components/ui/`** (shadcn gerado). Customização vira componente
    próprio em `src/components/rumvia/`.
12. Migration nova = timestamp do dia + nome descritivo. Tabela/função nova leva
    `REVOKE ALL ... FROM anon, authenticated` **explícito** antes do `GRANT` do que é
    intencional, e o estado se confere por `relacl`/`proacl` (regra 6 do `CLAUDE.md`).

---

## Fases

Executar **em ordem**. A Fase 0 é pré-requisito de todas as outras: sem ela nenhuma das
hipóteses seguintes é verificável. Commit por fase.

---

### FASE 0 — Instrumentação do funil (bloqueia todo o resto)

**Problema:** não existe um único evento de funil. Com pageview apenas, não dá para saber
quantos marcam o consentimento, quantos têm falha de parse, quantos veem o score e não
clicam em assinar. Toda otimização vira hipótese não falseável.

**O que fazer:** criar `src/lib/analytics.ts` exportando `track(evento, props?)` sobre o
`track` de `@vercel/analytics` (já é dependência, v2.0.1), com:

- no-op silencioso em SSR e em dev (`import.meta.env.DEV`), para não poluir o painel;
- tipagem literal dos nomes de evento — string solta não compila;
- **nenhum PII nas props.** Nunca e-mail, nome, id de usuário, nome de arquivo de CV.

Disparar exatamente estes eventos:

| Evento | Onde | Props |
|---|---|---|
| `landing_view` | `routes/index.tsx` | — |
| `cta_hero_click` | CTA do hero | — |
| `consent_checked` | `cv-dropzone.tsx` | — |
| `cv_upload_started` | `cv-dropzone.tsx` | `origem: 'landing' \| 'analise'` |
| `cv_upload_ok` | `cv-dropzone.tsx` | `origem` |
| `cv_parse_failed` | `routes/analise.tsx` | `motivo` (a mensagem já tratada, não stack) |
| `gap_ready` | `routes/analise.tsx` | `score`, `track`, `postingsSample`, `lowConfidence` |
| `signup_started` | `routes/cadastro.tsx` | `metodo: 'email' \| 'google'` |
| `signup_ok` | `routes/cadastro.tsx` | `metodo` |
| `checkout_started` | `_conta/assinatura.tsx` | `planKey` |
| `checkout_paid` | `_conta/assinatura.tsx` (ao virar `isPro` voltando do checkout) | `planKey` |

**Critério de sucesso:** os 11 eventos aparecem no painel da Vercel e é possível montar a
tabela de passagem entre etapas. `bun run lint` limpo.

---

### FASE 1 — Dobra mobile e prova social (maior impacto, menor custo)

#### 1.1 🔴 Reconstruir a dobra mobile

**Problema:** o H1 de 58px fixo ocupa 241px (30% da tela) e empurra a dropzone para 152px
abaixo da dobra. A escala tipográfica em `src/styles.css` é toda em px fixo, sem `clamp()`
e sem media query.

**O que alterar:**

- `src/styles.css`, bloco `/* tipografia */` (perto da linha 272) — trocar por escala fluida,
  mantendo os valores atuais como **teto**:
  ```css
  --text-h1: clamp(30px, 7.5vw, 42px);
  --text-h2: clamp(24px, 5.5vw, 32px);
  --text-h3: clamp(20px, 4.5vw, 25px);
  ```
  `h4`–`h6`, `body` e `caption` ficam como estão.
- `src/routes/index.tsx`, hero: remover o `style={{ fontSize: 58 }}` inline do `<h1>`.
  O H1 passa a no máximo **36px em mobile** e 58px de `lg:` para cima (classe responsiva,
  não style inline).
- Hero: `py-20` → `py-10 lg:py-20`.
- **Inverter a ordem em mobile:** o card de upload vem antes do parágrafo de apoio. O grid
  do hero vira `flex flex-col-reverse gap-8 lg:grid lg:grid-cols-[1fr_440px]`.
- O parágrafo de apoio e o rodapé mono ("Prévia sem cadastro · Resultado em menos de 30
  segundos · Painel completo a partir de …") ficam **abaixo** do card em mobile. O rodapé
  mono continua citando o preço via `maisBarato`, nunca escrito à mão.

**Critério de sucesso:** em 375×812, `getBoundingClientRect().top + scrollY` do botão
"Selecionar arquivo" **e** do checkbox de consentimento são < 812. Medir com o protocolo
da seção "Verificação".

#### 1.2 🔴 Remover a prova social falsa

**Problema:** a seção CTA BOTTOM afirma *"Centenas de devs já sabem exatamente o que
precisam estudar"* com 6 contas permanentes e 0 assinantes na base. É afirmação não
verificável e hoje falsa — publicidade enganosa (CDC art. 37), no mesmo produto que
respeita o art. 49 à risca.

**O que alterar:** em `src/routes/index.tsx`, seção CTA BOTTOM, trocar por prova de dado,
que existe de verdade:

> "Sua aderência é calculada contra **{stats.jobs} vagas reais** dos últimos 90 dias — não
> contra opinião de recrutador. A prévia é grátis e não pede cadastro."

Enquanto `stats` não carregou, cai para a versão sem número (mesmo padrão de
`trilhasEmProsa`). Depois, rodar `grep -rn` e garantir que **nenhum texto do site afirma
volume de usuários, clientes ou devs** enquanto esse dado não existir.

**Critério de sucesso:** zero ocorrências de claim de volume de usuários em `src/`.

---

### FASE 2 — Clareza da oferta

#### 2.1 🟠 Hero com uma promessa e um número

**Problema:** o subhead empilha quatro promessas e termina em clichê ("tudo na palma da sua
mão"). O diferencial real — porcentagem contra vagas reais, leitura determinística — não
aparece acima da dobra, e não há número nenhum lá.

**O que alterar** em `src/routes/index.tsx`, hero:

- Eyebrow: `// Análise gratuita · sem cadastro` (tirar "de aderência", que o H1 já diz).
- H1: **mantém o texto atual** — a pergunta funciona. Muda só o tamanho (item 1.1).
- Subhead — substituir integralmente:
  > "Comparamos seu currículo com **{stats.jobs} vagas reais** de {trilhasEmProsa} e
  > devolvemos, em porcentagem, o quanto você está aderente — e exatamente quais skills
  > estão te custando entrevistas. Leitura por dicionário, sem IA generativa."

  Sem `stats`, cai para a mesma frase sem o número e sem a lista de trilhas.
- Rodapé mono: **não mexer**, já está correto.

**Critério de sucesso:** bounce da landing cai ≥ 10%; `consent_checked / landing_view` sobe.

#### 2.2 🟠 Subir a prova, tirar a seção decorativa do caminho

**Problema:** o trust strip (4.236 vagas) só aparece após ~2.200px, atrás da seção "Sua
Rota" — 880px de SVG decorativo que **nem renderiza em mobile** (`hidden … md:block` no
`RotaMap`), ou seja, em telefone ela só consome scroll.

**O que alterar** em `src/routes/index.tsx`:

- Reordenar para: `HERO → TRUST STRIP → HOW IT WORKS → FEATURES → SUA ROTA → PLANOS → FAQ → CTA`.
- A seção "Sua Rota" **inteira** (não só o `<svg>`) recebe `hidden md:block`.

**Critério de sucesso:** landing mobile encurta ~880px; profundidade de scroll até `#planos`
sobe em mobile.

#### 2.3 🟠 Acabar com o CTA que não avança

**Problema:** "Analisar meu CV — grátis" navega para `/analise`, que renderiza **a mesma
`CvDropzone`** já visível ao lado dele. O clique custa um pageload e entrega o mesmo estado
vazio.

**O que alterar:**

- Dar `id="enviar-cv"` ao card de upload do hero.
- O CTA do hero vira `<button>` que faz `scrollIntoView({ behavior: 'smooth' })` no card e
  `focus()` no checkbox de consentimento, disparando `track('cta_hero_click')`.
  Em mobile, com o card já acima da dobra (item 1.1), ele fica visualmente secundário.
- O CTA do **header** continua indo para `/analise` — é o caminho certo para quem já rolou.
- Os CTAs das seções Planos e CTA-bottom continuam em `/analise`.

**Critério de sucesso:** `cv_upload_started / cta_hero_click` ≥ 60%.

---

### FASE 3 — Momento da decisão

#### 3.1 🟠 Garantia de 7 dias como elemento de destaque

**Problema:** a única reversão de risco do produto (`AVISO_ARREPENDIMENTO` — 7 dias,
devolução **integral**, CDC art. 49) aparece como parágrafo cinza em `text-caption` e dentro
de um accordion de FAQ fechado. Em produto pago **sem trial**, a garantia é o trial.

**O que alterar:** criar `src/components/rumvia/garantia-badge.tsx` — bloco com hairline,
ícone de escudo (`lucide-react`), título **"7 dias de garantia — devolução integral"** e,
abaixo, a frase completa de `AVISO_ARREPENDIMENTO` em caption. O texto **vem de
`plan-copy.ts`**, não é reescrito no componente; o prazo vem de `DIAS_ARREPENDIMENTO`.

Usar em três lugares:

1. `routes/index.tsx` — dentro do card do plano pago, **acima** do botão "Começar pelo
   currículo", substituindo o parágrafo caption atual.
2. `_conta/assinatura.tsx` — imediatamente acima da linha de botões de assinar.
3. `routes/analise.tsx` — no bloco final de conversão para visitante anônimo.

**Critério de sucesso:** `checkout_started / assinatura_view` sobe ≥ 15%.

#### 3.2 🟠 Inverter a hierarquia do cadastro

**Problema:** em `/cadastro`, o botão do Google fica **abaixo** de um formulário de quatro
campos, depois de um divisor "ou". OAuth converte melhor e o fluxo com CV enviado já usa
`linkIdentity` para preservar o `user.id`.

**O que alterar** em `src/routes/cadastro.tsx`:

- `GoogleButton` sobe para o topo, largura total, acima do divisor.
- O formulário de e-mail/senha fica atrás de um toggle "Prefiro criar com e-mail e senha",
  **fechado por padrão**.
- O checkbox de termos sobe para **antes** dos dois caminhos — ele já governa os dois, mas
  hoje está visualmente preso ao formulário.
- O subtítulo para `isAnonymous` (a frase que diz que a análise atual continua válida)
  **fica como está** — reduz medo de perder o trabalho já feito.
- `AVISO_ACESSO_PAGO` continua visível antes do clique, nos dois caminhos.

**⚠️ NÃO remover o campo "Confirmar senha" nesta entrega.** Ele parece fricção
desnecessária, mas a rede de segurança está quebrada: por `docs/PROGRESS.md`,
`recovery_sent_at` é **0 em todas as contas** — `/recuperar-senha` nunca entregou um
e-mail. Remover o campo antes de consertar o SMTP transforma erro de digitação em conta
perdida. Registrar a dependência no `PROGRESS.md`.

**Critério de sucesso:** Google passa de 50% dos cadastros; `signup_ok / signup_started` sobe.

#### 3.3 🟠 Resumo do pedido antes de sair para o Asaas

**Problema:** `use-subscription.tsx` faz `window.location.href = url` — o próximo pixel
depois de "Assinar" é de outro domínio, com outra marca. É o ponto de maior ansiedade do
funil e o único sem UX própria.

**O que alterar** em `_conta/assinatura.tsx`: o clique em "Assinar" abre um `Dialog` com

- ciclo escolhido e valor cobrado agora (de `billing_plans`, via `formatCents`);
- quando sai a próxima cobrança (`rotuloCobranca(plano.cycle)`);
- o `GarantiaBadge`;
- "O pagamento é processado pelo **Asaas** — o RUMVIA nunca vê os dados do seu cartão";
- botão final "Ir para o pagamento seguro".

`useStartCheckout` só é chamado no botão final do diálogo. Os textos de método continuam
derivando de `plano.methods` (ver restrição 6).

**Critério de sucesso:** `checkout_paid / checkout_started` sobe ≥ 10%.

---

### FASE 4 — Ativação pós-pagamento

#### 4.1 🟠 Encurtar o caminho entre pagar e ver o próprio score

**Problema:** quem acabou de pagar — pico de intenção do ciclo inteiro — cai num
`/onboarding` que pede trilha, variante, senioridade, senioridade-alvo, anos, segmento e
moeda "para confirmar" o que o CV já inferiu, e em seguida leva um tour de **14 passos**.

**O que alterar:**

- `src/routes/onboarding.tsx`, ramo `inferido`: a tela principal fica com **trilha +
  segmento** apenas (os dois que governam todos os números). Variante, senioridade,
  senioridade-alvo, anos e moeda vão para um bloco recolhido "Ajustar mais detalhes".
  Botão: **"Ver minha análise completa"**.
  A senioridade continua vindo do parser e sendo gravada normalmente — só sai da tela
  principal (restrição 7).
  `target_region` **continua sendo gravado** — `use-market.tsx` deriva o segmento dele, e
  sem isso tudo cai em `br` por default.
- `src/lib/tour-steps.ts`: reduzir de 14 para no máximo **6 passos** no primeiro login
  (boas-vindas · filtros de trilha/segmento · dashboard · CV · plano de estudos · fim).
  Os demais viram tooltip contextual na primeira visita de cada tela.
  O tour continua sendo só pós-cadastro, dentro da área logada (restrição 8).

**Critério de sucesso:** ≥ 90% dos assinantes chegam ao dashboard na mesma sessão do
pagamento; conclusão do tour ≥ 60%.

---

### FASE 5 — Otimização incremental (só depois de haver dado da Fase 0)

#### 5.1 🟡 Ancorar o preço e mostrar o número real do dicionário

**Problema:** R$ 29,90 aparece sem referência nenhuma. E o trust strip mostra **"207+ Skills
catalogadas"** em fonte 44px enquanto o FAQ fala em **"mais de 830 termos"** — o número
maior está escondido no accordion. Os dois são verdadeiros e medem coisas diferentes.

**O que alterar:**

- Seção Planos, acima dos cards: "Menos que uma hora de mentoria avulsa. O mesmo acesso nos
  três ciclos — só muda o preço por mês." (frase de ancoragem, sem citar valor fixo).
- Trust strip, card do meio: número grande `830+` com label "Termos no dicionário" e hint
  "207 skills canônicas · aliases PT e EN".
  **O segundo número tem que vir de `landing_stats()`** — se não existir lá, adicionar por
  migration nova (a função já existe desde `20260826173938` e foi alterada três vezes;
  seguir o mesmo padrão e refazer o `REVOKE`/`GRANT` ao final). **Não escrever 830 no JSX.**

#### 5.2 🟡 Consentimento que se explica

**Problema:** em `cv-dropzone.tsx`, `bloqueado = !consent || uploading || loading || !user`
deixa o botão com `opacity-70` e **nenhuma mensagem**. O erro só aparece por toast depois de
tentar arrastar um arquivo; quem clica no botão desabilitado não recebe feedback nenhum.

**O que alterar:** caption abaixo do botão, com `aria-describedby` ligando os dois:
`!consent` → "Marque a autorização abaixo para liberar o envio";
`!user || loading` → "Preparando sua sessão…".
O checkbox **continua onde está e continua obrigatório** (LGPD) — só ganha feedback.

**Critério de sucesso:** `cv_upload_started / consent_checked` ≥ 85%.

#### 5.3 🟡 Retenção no cancelamento

**Problema:** o cancelamento em `/assinatura` (com o `CANCELAR` digitado, que é bom atrito
deliberado) sai sem coletar motivo e sem oferecer nada. Cada churn some sem deixar o dado
que diria onde o produto falha.

**O que alterar:** um passo antes da confirmação — select de motivo **obrigatório** (caro
demais · não uso o suficiente · já consegui a vaga · faltou trilha/dado · problema técnico ·
outro), gravado em `subscriptions.cancel_reason` (migration nova). Oferta condicional:
motivo "caro demais" + ciclo mensal → oferecer trimestral/anual antes de seguir;
"já consegui a vaga" → parabenizar e oferecer pausa.

**O botão de cancelar nunca fica escondido nem atrás de contato humano** — a oferta é um
passo, não um bloqueio. Dentro dos 7 dias o caminho de estorno integral continua intacto.

#### 5.4 🟡 Monetizar o catálogo que já existe

**Problema:** `/certificacoes` e `/cursos` fazem a recomendação mais qualificada do produto
(priorizada pelo gap real) e não geram receita nenhuma.

**O que alterar:** coluna `affiliate_url` em `certifications` e `courses` (migration nova,
com o `REVOKE`/`GRANT` da regra 6); o front usa `affiliate_url ?? url`. Divulgação
obrigatória e visível na tela: "Alguns links são de parceria — isso não altera a ordem da
recomendação, que é calculada pelo seu gap."
**A ordenação continua vindo do gap, jamais de comissão.**

---

## Verificação

Obrigatória ao fim de cada fase. Não entregar fase sem isto.

```bash
bun run lint
bun run build
```

Servidor de dev (**nunca subir servidor por outro meio**): usar a configuração `rumvia-dev`
de `.claude/launch.json` (porta 8100).

Medição da dobra mobile — emular **375×812** e rodar no console da página:

```js
const el = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Selecionar arquivo'));
const chk = [...document.querySelectorAll('label')].find(l => l.textContent.includes('Autorizo'));
({
  viewport: innerHeight,
  botao: Math.round(el.getBoundingClientRect().top + scrollY),
  consentimento: Math.round(chk.getBoundingClientRect().top + scrollY),
  h1: getComputedStyle(document.querySelector('h1')).fontSize,
  docH: document.body.scrollHeight
})
```

Aprovado quando `botao < 812` **e** `consentimento < 812`. Anexar o resultado ao commit da
Fase 1.

Conferir também, em 375, 768 e 1440: nenhum scroll horizontal, nenhum texto estourando
container, contraste preservado no hero (fundo `accent-900`).

---

## Fora de escopo (não fazer nesta entrega)

- Reativar PIX ou escrever copy que o mencione como disponível (restrição 6).
- Criar trial. A decisão hoje é vender a **garantia de 7 dias**, que já existe implementada
  de verdade, em vez de construir período gratuito.
- Alterar a fórmula de gap, o parser ou o matcher.
- Alterar a ordem do funil (CV antes do cadastro; pagamento antes do onboarding).
- Mudar preços — isso é `UPDATE` em `billing_plans`, não deploy.
- Remover "Confirmar senha" do cadastro (ver 3.2).
- Consertar o SMTP de `/recuperar-senha`. **É bloqueio de lançamento e tarefa própria** —
  hoje atinge 6 pessoas, depois do lançamento atinge quem já pagou e não consegue entrar.
  Abrir como item separado no `PROGRESS.md`.

---

## Definição de pronto

- [ ] Fases 0 a 5 implementadas, uma por commit.
- [ ] `bun run lint` e `bun run build` limpos.
- [ ] Medição da dobra mobile anexada, com `botao < 812`.
- [ ] Nenhum hex solto, nenhum preço em JSX, nenhuma trilha citada em string literal,
      nenhum claim de volume de usuários.
- [ ] `docs/PROGRESS.md` atualizado com o que entrou, o "antes" medido e as duas
      dependências abertas (SMTP de recuperação de senha; PIX aguardando CNPJ).
