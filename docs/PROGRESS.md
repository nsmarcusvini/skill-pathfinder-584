# RUMVIA — Progress

## Roadmap

| Prompt | Feature | Status | Data |
|--------|---------|--------|------|
| 0–8B | Setup, auth, CV parser, gap, dashboard, minhas-skills | ✅ Concluído | — |
| 9 | Ferramentas + Empresas (`ferramentas.tsx`, `empresas.tsx`, `market.functions.ts`) | ✅ Concluído | 2026-08-26 |
| 10 | Salários (`salarios.tsx` + adições ao `market.functions.ts`) | ✅ Concluído | 2026-08-26 |
| 11 | Progresso (migration + `study.functions.ts` + `progresso.tsx`) | ✅ Concluído | 2026-08-26 |
| 12 | Certificações + Cursos (migration + seed + `learning.functions.ts` + duas rotas) | ✅ Concluído | 2026-08-26 |
| 13 | Admin de trilhas + painel de saúde | ✅ Concluído | 2026-08-26 |
| 14 | Expurgo de anônimos + notificações + LGPD + responsividade + smoke test | ✅ Concluído | 2026-08-26 |
| 8C | Stripe (avulso R$7,99 + Pro R$30/mês) | ⏳ Pendente | — |

## Notas

- Prompt 9: `market.functions.ts` com 6 server functions (`getToolRanking`, `getToolDetail`, `getToolMonthly`, `getCompanyRanking`, `getCompanyDetail`, `getCompanyMonthly`). `ferramentas.tsx`: ranking com filtro de categoria, mode compare, sheet com salário/co-ocorrência/addToStudyPlan. `empresas.tsx`: ranking ordenável, follow/unfollow, sheet com mini-score e vagas abertas.
- Prompt 10: `market.functions.ts` ganhou 3 server functions (`getSalaryStats`, `getSalarySkillImpact`, `submitSalaryObservation`). `salarios.tsx`: comparação BR×Global, faixa por senioridade (BarChart P25–P75), impacto de skills no salário (top 15 skills, delta %, destaque de skills faltantes), simulador (senioridade-alvo + skills), formulário de contribuição (só conta permanente, anônimo, n≥5).
- Prompt 11: migration `20260826200000_study_tables.sql` (study_plans, study_items, study_logs, RLS). `study.functions.ts`: getStudyPlans, createStudyPlan, updatePlanStatus, getStudyItems, createStudyItem, updateStudyItem, deleteStudyItem, addStudyLog, getStudyHeatmap, generatePlanFromGap. `progresso.tsx`: heatmap 180d com streak, Kanban HTML5 drag-and-drop (backlog/fazendo/concluído), geração automática de plano do gap, log de horas, guard anônimo.
- Prompt 12: migration `20260826201000_learning_tables.sql` (certifications_catalog + user_certifications + courses_catalog + user_courses, RLS, seed 24 certs + 24 cursos via track key lookup). `learning.functions.ts`: getCertsCatalog, getCoursesCatalog, getUserCerts, upsertUserCert, deleteUserCert, getUserCourses, upsertUserCourse, deleteUserCourse, addLearningItemToStudyPlan. `certificacoes.tsx`: catálogo ordenado por gap impact, edit dialog, add-to-plan, custom cert. `cursos.tsx`: filtros formato/preço/idioma, progresso bar, add-to-plan, custom course.
- Prompt 13: `admin.functions.ts` ganhou listTracks, toggleTrack, upsertTrack, getHealthStats. `admin.trilhas.tsx`: CRUD de trilhas + variantes de cargo (criar/editar/ativar/desativar). `admin.saude.tsx`: painel de saúde com 12 métricas (usuários, vagas, gap, views, cron). Nav do admin atualizada com "Trilhas" e "Saúde". `docs/ADICIONAR_TRILHA.md` criado (guia passo a passo, sem hardcode de track key).
- Prompt 14: migration `20260826210000_notifications_and_cron.sql` (tabela notifications com RLS, expire_old_jobs (vagas >90d), purge_inactive_anonymous (7d), notify_expiring_certs + pg_cron schedules). App-shell: bottom nav mobile (5 itens fixos no rodapé, padding pb-20 no main). 404/ErrorComponent traduzidos para pt-BR. Export JSON ampliado: inclui gap_analyses, user_skills, study_plans, user_certifications, user_courses.
