# Career Compass (00)

Você vai construir o RUMVIA, uma aplicação web que compara o CV de um profissional de tecnologia

com a demanda real do mercado e mostra, em porcentagem, o quanto ele está aderente à trilha de

carreira que escolheu.

STACK OBRIGATÓRIA: React + Vite + TypeScript + Tailwind + shadcn/ui no front; Supabase para

Postgres, Auth, Storage e Edge Functions (Deno). TanStack Query para data fetching. Sem backend

próprio, sem Next.js, sem Prisma.

REGRAS INEGOCIÁVEIS:

1. Trilha de carreira é DADO no banco, nunca condicional no código. Trilhas iniciais: devops

   (variantes DevOps Engineer, Platform Engineer, SRE), data_engineer, fullstack. O sistema tem

   que suportar adicionar "backend" e "frontend" depois apenas inserindo linhas no banco.

2. RLS habilitado em toda tabela. Dados do usuário isolados por auth.uid().

3. Nenhuma chave de API no front-end. Tudo em Supabase Secrets + Edge Function.

4. Ingestão de vagas usa adapter pattern e SOMENTE fontes gratuitas no MVP: APIs públicas de ATS

   (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee), agregadores tech públicos

   (Remotive, RemoteOK, Himalayas, Jobicy, Arbeitnow) e importação CSV. Proibido scraping direto

   de LinkedIn, Indeed e Glassdoor. Adapters pagos ficam criados porém desativados.

5. NÃO use LLM em nenhuma parte do MVP. A extração de skills, tanto do CV quanto das vagas, é

   determinística: dicionário canônico + tabela de aliases bilíngue (pt-BR e inglês) +

   similaridade trigram com pg_trgm. Termos desconhecidos vão para uma fila de curadoria.

6. Toda vaga e toda métrica têm a dimensão market_segment: 'br' (Brasil) ou 'remoto_global'.

   Nunca misture os dois no mesmo número. Salário em BRL para br e USD para remoto_global.

7. A fórmula de aderência é única e vive numa Edge Function chamada compute-gap. Nenhuma tela

   recalcula score por conta própria.

8. Toda a interface em português do Brasil. Os textos das vagas podem estar em inglês.

9. O visitante pode enviar o CV e ver uma prévia da análise SEM criar conta, usando Supabase

   Anonymous Sign-In. Ao se cadastrar, o mesmo user.id é convertido em conta permanente com

   updateUser — nunca crie usuário novo nem copie dados entre contas. Há botão "Entrar" visível

   para quem já é cliente.

10. Siga estritamente o Design System RUMVIA definido no próximo prompt: nada de cores, fontes,

    raios ou sombras fora dos tokens.

Confirme que entendeu e aguarde os próximos prompts. Não gere código ainda.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://skill-pathfinder-584.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/aab156fd-05de-4134-a07d-98ff09ebf0ee).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
