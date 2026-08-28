-- RUMVIA :: trilhas Front-End, Back-End e QA Analyst
--
-- Regra 1 do CLAUDE.md: trilha é DADO, não código. Esta migration só insere
-- linhas — nenhum componente React muda. Segue o roteiro de
-- docs/ADICIONAR_TRILHA.md (skills -> aliases -> trilha -> variantes ->
-- baselines -> catálogo de aprendizado -> reclassificação das vagas).
--
-- Tudo é idempotente (ON CONFLICT DO NOTHING / NOT EXISTS): rodar duas vezes
-- não duplica nada.

-- ===========================================================================
-- 1. Skills novas que as três trilhas precisam e que ainda não existiam
-- ===========================================================================
-- Skills já presentes no catálogo (React, TypeScript, PostgreSQL, Cypress,
-- Docker, Git, Testes Automatizados, ...) são reaproveitadas, não recriadas.
-- NÃO foram criadas as skills "TDD", "Testes Unitários" e "Testes E2E": esses
-- termos já são alias de "Testes Automatizados"/"Cypress" no seed 0002 e uma
-- skill nova só duplicaria peso na fórmula de aderência.

INSERT INTO public.skills (canonical_name, slug, category_id, is_tool, is_certifiable, match_patterns, is_ambiguous) VALUES
  -- front-end
  ('Figma', 'figma', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Design System', 'design-system', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('UX/UI', 'ux-ui', (SELECT id FROM public.skill_categories WHERE key = 'domain'), false, false, '{}'::text[], false),
  ('PWA', 'pwa', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('SEO', 'seo', (SELECT id FROM public.skill_categories WHERE key = 'domain'), false, false, '{}'::text[], false),
  ('Svelte', 'svelte', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('Styled Components', 'styled-components', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('Material UI', 'material-ui', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('Zustand', 'zustand', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('Testing Library', 'testing-library', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Internacionalização', 'internacionalizacao', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Micro Frontends', 'micro-frontends', (SELECT id FROM public.skill_categories WHERE key = 'domain'), false, false, '{}'::text[], false),
  ('React Native', 'react-native', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),

  -- back-end
  ('Django', 'django', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('FastAPI', 'fastapi', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('Flask', 'flask', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('Laravel', 'laravel', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('Ruby on Rails', 'ruby-on-rails', (SELECT id FROM public.skill_categories WHERE key = 'framework'), true, false, '{}'::text[], false),
  ('Kotlin', 'kotlin', (SELECT id FROM public.skill_categories WHERE key = 'language'), false, false, '{}'::text[], false),
  ('gRPC', 'grpc', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('RabbitMQ', 'rabbitmq', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Elasticsearch', 'elasticsearch', (SELECT id FROM public.skill_categories WHERE key = 'database'), false, false, '{}'::text[], false),
  ('OpenAPI', 'openapi', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Design Patterns', 'design-patterns', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Clean Architecture', 'clean-architecture', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  -- "solid" é palavra comum em inglês ("solid experience"): só casa por padrão.
  ('SOLID', 'solid', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, ARRAY['\bsolid\s+(principles?|principios|princípios|design)\b', '\b(principios|princípios)\s+solid\b', '\bsolid\s*[,/]\s*(dry|kiss|clean)\b']::text[], true),
  -- "DDD" no Brasil também é código de área telefônica.
  ('Domain-Driven Design', 'domain-driven-design', (SELECT id FROM public.skill_categories WHERE key = 'domain'), false, false, ARRAY['domain[\s-]driven\s+design', '\bddd\b(?![\s.:/-]*\d)']::text[], true),
  ('Mensageria', 'mensageria', (SELECT id FROM public.skill_categories WHERE key = 'domain'), false, false, '{}'::text[], false),
  ('Segurança de Aplicações', 'seguranca-de-aplicacoes', (SELECT id FROM public.skill_categories WHERE key = 'domain'), false, false, '{}'::text[], false),
  ('Caching', 'caching', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),

  -- qa
  ('Selenium', 'selenium', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Robot Framework', 'robot-framework', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Appium', 'appium', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Postman', 'postman', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('JMeter', 'jmeter', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('k6', 'k6', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Cucumber', 'cucumber', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Katalon Studio', 'katalon-studio', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('JUnit', 'junit', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('TestNG', 'testng', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('REST Assured', 'rest-assured', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('Jira', 'jira', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('TestRail', 'testrail', (SELECT id FROM public.skill_categories WHERE key = 'tool'), true, false, '{}'::text[], false),
  ('BDD', 'bdd', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Qualidade de Software', 'qualidade-de-software', (SELECT id FROM public.skill_categories WHERE key = 'domain'), false, false, '{}'::text[], false),
  ('Testes Manuais', 'testes-manuais', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Plano de Testes', 'plano-de-testes', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Casos de Teste', 'casos-de-teste', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Testes Funcionais', 'testes-funcionais', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Testes de Regressão', 'testes-de-regressao', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Testes de API', 'testes-de-api', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Testes de Performance', 'testes-de-performance', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Testes de Segurança', 'testes-de-seguranca', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Testes Mobile', 'testes-mobile', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false),
  ('Gestão de Defeitos', 'gestao-de-defeitos', (SELECT id FROM public.skill_categories WHERE key = 'practice'), false, false, '{}'::text[], false)
ON CONFLICT (canonical_name) DO NOTHING;

-- ===========================================================================
-- 2. Aliases bilíngues das skills novas (regra 2: matcher determinístico)
-- ===========================================================================
-- `alias` é UNIQUE global (citext). Nenhum termo abaixo colide com os aliases
-- do seed 0002 — em caso de colisão futura o ON CONFLICT apenas ignora, e o
-- termo continua apontando para a skill que o registrou primeiro.

INSERT INTO public.skill_aliases (skill_id, alias, lang, source) VALUES
  -- front-end
  ((SELECT id FROM public.skills WHERE canonical_name = 'Design System'), 'design systems', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Design System'), 'sistema de design', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Design System'), 'biblioteca de componentes', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Design System'), 'component library', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'UX/UI'), 'ux', 'any', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'UX/UI'), 'ui/ux', 'any', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'UX/UI'), 'ux/ui design', 'any', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'UX/UI'), 'design de interface', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'UX/UI'), 'experiência do usuário', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'UX/UI'), 'user experience', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'PWA'), 'progressive web app', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'PWA'), 'progressive web apps', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'PWA'), 'aplicativo web progressivo', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'SEO'), 'search engine optimization', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'SEO'), 'otimização para buscadores', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Svelte'), 'sveltekit', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Svelte'), 'svelte kit', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Styled Components'), 'styled-components', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Styled Components'), 'css-in-js', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Styled Components'), 'css in js', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Material UI'), 'mui', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Material UI'), 'material-ui', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Material UI'), 'material design', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testing Library'), 'react testing library', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testing Library'), 'testing-library', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Internacionalização'), 'i18n', 'any', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Internacionalização'), 'internationalization', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Internacionalização'), 'internacionalizacao', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Micro Frontends'), 'microfrontends', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Micro Frontends'), 'micro frontend', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Micro Frontends'), 'micro front-ends', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Micro Frontends'), 'module federation', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'React Native'), 'react-native', 'en', 'curated'),

  -- back-end
  ((SELECT id FROM public.skills WHERE canonical_name = 'Django'), 'django rest framework', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'FastAPI'), 'fast api', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Laravel'), 'laravel framework', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Ruby on Rails'), 'ruby-on-rails', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Ruby on Rails'), 'rails framework', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'gRPC'), 'protobuf', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'gRPC'), 'protocol buffers', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'RabbitMQ'), 'rabbit mq', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'RabbitMQ'), 'amqp', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Elasticsearch'), 'elastic search', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Elasticsearch'), 'opensearch', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'OpenAPI'), 'swagger', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'OpenAPI'), 'open api', 'en', 'curated'),
  -- "padrões de projeto" já é alias de "Arquitetura de Software" no seed 0002
  -- (alias é UNIQUE global); não se repete aqui para não virar linha morta.
  ((SELECT id FROM public.skills WHERE canonical_name = 'Design Patterns'), 'design pattern', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Design Patterns'), 'padrões de design', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Design Patterns'), 'padroes de design', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Clean Architecture'), 'arquitetura limpa', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Domain-Driven Design'), 'design orientado a domínio', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Mensageria'), 'filas de mensagens', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Mensageria'), 'sistema de mensageria', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Mensageria'), 'message broker', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Mensageria'), 'message queue', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Segurança de Aplicações'), 'owasp', 'any', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Segurança de Aplicações'), 'application security', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Segurança de Aplicações'), 'appsec', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Segurança de Aplicações'), 'segurança da aplicação', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Caching'), 'cache', 'any', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Caching'), 'cache distribuído', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Caching'), 'estratégias de cache', 'pt', 'curated'),

  -- qa
  ((SELECT id FROM public.skills WHERE canonical_name = 'Selenium'), 'selenium webdriver', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Selenium'), 'webdriver', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Robot Framework'), 'robotframework', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Postman'), 'newman', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'JMeter'), 'apache jmeter', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'k6'), 'grafana k6', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Cucumber'), 'gherkin', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Cucumber'), 'cucumber js', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Katalon Studio'), 'katalon', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'JUnit'), 'junit 5', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'REST Assured'), 'restassured', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'REST Assured'), 'rest-assured', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Jira'), 'atlassian jira', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'TestRail'), 'test rail', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'BDD'), 'behavior driven development', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'BDD'), 'behaviour driven development', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'BDD'), 'desenvolvimento orientado a comportamento', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Qualidade de Software'), 'qa', 'any', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Qualidade de Software'), 'quality assurance', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Qualidade de Software'), 'garantia da qualidade', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Qualidade de Software'), 'controle de qualidade', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Qualidade de Software'), 'software quality', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes Manuais'), 'teste manual', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes Manuais'), 'manual testing', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Plano de Testes'), 'plano de teste', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Plano de Testes'), 'planejamento de testes', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Plano de Testes'), 'estratégia de testes', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Plano de Testes'), 'test plan', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Casos de Teste'), 'caso de teste', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Casos de Teste'), 'cenários de teste', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Casos de Teste'), 'roteiros de teste', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Casos de Teste'), 'test case', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Casos de Teste'), 'test cases', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes Funcionais'), 'teste funcional', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes Funcionais'), 'functional testing', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Regressão'), 'teste de regressão', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Regressão'), 'regression testing', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de API'), 'teste de api', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de API'), 'testes de apis', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de API'), 'api testing', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Performance'), 'teste de performance', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Performance'), 'testes de carga', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Performance'), 'teste de carga', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Performance'), 'testes de estresse', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Performance'), 'performance testing', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Performance'), 'load testing', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Segurança'), 'teste de segurança', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes de Segurança'), 'security testing', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes Mobile'), 'teste mobile', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Testes Mobile'), 'mobile testing', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Gestão de Defeitos'), 'gestão de bugs', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Gestão de Defeitos'), 'registro de defeitos', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Gestão de Defeitos'), 'reporte de bugs', 'pt', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Gestão de Defeitos'), 'bug tracking', 'en', 'curated'),
  ((SELECT id FROM public.skills WHERE canonical_name = 'Gestão de Defeitos'), 'defect management', 'en', 'curated')
ON CONFLICT (alias) DO NOTHING;

-- ===========================================================================
-- 3. As três trilhas
-- ===========================================================================

INSERT INTO public.career_tracks (key, name, description, icon, color_token, sort_order) VALUES
  ('frontend', 'Front-End', 'Interfaces web: componentes, acessibilidade, performance e experiência do usuário.', 'monitor', 'accent-400', 4),
  ('backend', 'Back-End', 'APIs, regras de negócio, persistência e integrações do lado do servidor.', 'server', 'accent2-500', 5),
  ('qa', 'QA Analyst', 'Qualidade de software: estratégia de testes, automação e prevenção de defeitos.', 'bug', 'neutral-700', 6)
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- 4. Variantes de cargo (usadas para classificar vagas e títulos do CV)
-- ===========================================================================
-- `normalizeTitle` (src/lib/ingest/normalize.ts) tira acento e troca hífen por
-- espaço antes de comparar, e `classifyTrack` usa `includes` com o termo mais
-- longo vencendo. Por isso cada termo aparece nas duas grafias (com hífen e
-- com espaço) e sem acento — senão a variante fica inerte na ingestão.

INSERT INTO public.track_role_variants (track_id, key, name, search_terms, sort_order) VALUES
  ((SELECT id FROM public.career_tracks WHERE key = 'frontend'), 'frontend_developer', 'Front-End Developer', ARRAY['frontend','front end','front-end','frontend developer','front end developer','frontend engineer','front end engineer','desenvolvedor frontend','desenvolvedor front end','desenvolvedora front end','engenheiro front end','engenheiro de frontend']::text[], 1),
  ((SELECT id FROM public.career_tracks WHERE key = 'frontend'), 'ui_engineer', 'UI Engineer', ARRAY['ui engineer','ui developer','web ui developer','desenvolvedor de interfaces','engenheiro de interface','desenvolvedor de interface']::text[], 2),
  ((SELECT id FROM public.career_tracks WHERE key = 'frontend'), 'js_framework_developer', 'Desenvolvedor React / Angular / Vue', ARRAY['react developer','desenvolvedor react','angular developer','desenvolvedor angular','vue developer','desenvolvedor vue','javascript developer','desenvolvedor javascript']::text[], 3),

  ((SELECT id FROM public.career_tracks WHERE key = 'backend'), 'backend_developer', 'Back-End Developer', ARRAY['backend','back end','back-end','backend developer','back end developer','backend engineer','back end engineer','desenvolvedor backend','desenvolvedor back end','desenvolvedora back end','engenheiro back end','engenheiro de backend']::text[], 1),
  ((SELECT id FROM public.career_tracks WHERE key = 'backend'), 'api_developer', 'API Developer', ARRAY['api developer','api engineer','desenvolvedor de api','desenvolvedor de apis','engenheiro de apis','desenvolvedor de integracoes','desenvolvedor de integrações']::text[], 2),
  ((SELECT id FROM public.career_tracks WHERE key = 'backend'), 'server_side_developer', 'Server-Side Developer', ARRAY['server side developer','server-side developer','server side engineer','desenvolvedor java','java developer','node.js developer','desenvolvedor node','python developer','desenvolvedor python','golang developer','desenvolvedor php','.net developer','desenvolvedor .net']::text[], 3),

  ((SELECT id FROM public.career_tracks WHERE key = 'qa'), 'qa_analyst', 'Analista de QA', ARRAY['analista de qa','qa analyst','analista de qualidade','analista de testes','analista de teste de software','quality assurance analyst','qa tester','tester']::text[], 1),
  ((SELECT id FROM public.career_tracks WHERE key = 'qa'), 'qa_engineer', 'QA Engineer', ARRAY['qa engineer','quality assurance engineer','quality engineer','engenheiro de qualidade','test engineer','engenheiro de testes','sdet','software development engineer in test']::text[], 2),
  ((SELECT id FROM public.career_tracks WHERE key = 'qa'), 'test_automation_engineer', 'Engenheiro de Automação de Testes', ARRAY['automacao de testes','automação de testes','qa automation','test automation engineer','automation engineer','analista de automacao de testes','engenheiro de automacao de testes']::text[], 3)
ON CONFLICT (track_id, key) DO NOTHING;

-- ===========================================================================
-- 5. Baselines de skill por senioridade
-- ===========================================================================
-- Uma linha por (trilha, skill) com a importância na senioridade júnior; as
-- outras três senioridades são derivadas com o mesmo degrau usado no seed 0002
-- (+14 pleno, +24 sênior, +28 staff, teto 100) e a mesma faixa de
-- `required_level`. Isso mantém a escala comparável entre trilhas — a fórmula
-- de aderência (regra 3) continua sendo a única, em gap.functions.ts.

CREATE TEMP TABLE rumvia_baseline_spec (
  track_key  text    NOT NULL,
  skill_name text    NOT NULL,
  base_imp   integer NOT NULL,
  is_core    boolean NOT NULL
);

INSERT INTO rumvia_baseline_spec (track_key, skill_name, base_imp, is_core) VALUES
  -- ------------------------------------------------------------- front-end
  ('frontend', 'JavaScript', 84, true),
  ('frontend', 'HTML', 82, true),
  ('frontend', 'CSS', 82, true),
  ('frontend', 'TypeScript', 80, true),
  ('frontend', 'React', 80, true),
  ('frontend', 'Git', 78, true),
  ('frontend', 'Responsividade', 72, true),
  ('frontend', 'REST', 68, false),
  ('frontend', 'Performance Web', 60, false),
  ('frontend', 'Next.js', 60, false),
  ('frontend', 'Resolução de Problemas', 60, false),
  ('frontend', 'Acessibilidade', 58, false),
  ('frontend', 'Testes Automatizados', 58, false),
  ('frontend', 'Comunicação', 58, false),
  ('frontend', 'Code Review', 56, false),
  ('frontend', 'Colaboração', 56, false),
  ('frontend', 'Tailwind CSS', 55, false),
  ('frontend', 'Design System', 48, false),
  ('frontend', 'Figma', 46, false),
  ('frontend', 'Jest', 46, false),
  ('frontend', 'Scrum', 46, false),
  ('frontend', 'UX/UI', 44, false),
  ('frontend', 'CI/CD', 44, false),
  ('frontend', 'Documentação', 44, false),
  ('frontend', 'Node.js', 42, false),
  ('frontend', 'Redux', 40, false),
  ('frontend', 'Cypress', 40, false),
  ('frontend', 'Vue.js', 38, false),
  ('frontend', 'React Query', 38, false),
  ('frontend', 'Vite', 38, false),
  ('frontend', 'Angular', 36, false),
  ('frontend', 'Testing Library', 34, false),
  ('frontend', 'Playwright', 34, false),
  ('frontend', 'GraphQL', 34, false),
  ('frontend', 'Sass', 32, false),
  ('frontend', 'SEO', 32, false),
  ('frontend', 'Docker', 32, false),
  ('frontend', 'Storybook', 30, false),
  ('frontend', 'Vitest', 30, false),
  ('frontend', 'Styled Components', 28, false),
  ('frontend', 'Webpack', 28, false),
  ('frontend', 'WebSockets', 26, false),
  ('frontend', 'Material UI', 24, false),
  ('frontend', 'PWA', 24, false),
  ('frontend', 'React Native', 24, false),
  ('frontend', 'Zustand', 22, false),
  ('frontend', 'Svelte', 20, false),
  ('frontend', 'Internacionalização', 20, false),
  ('frontend', 'Micro Frontends', 18, false),

  -- -------------------------------------------------------------- back-end
  ('backend', 'REST', 84, true),
  ('backend', 'SQL', 80, true),
  ('backend', 'Git', 80, true),
  ('backend', 'PostgreSQL', 74, true),
  ('backend', 'Testes Automatizados', 66, false),
  ('backend', 'Arquitetura de Software', 64, false),
  ('backend', 'Node.js', 62, false),
  ('backend', 'TypeScript', 62, false),
  ('backend', 'Docker', 62, false),
  ('backend', 'Resolução de Problemas', 62, false),
  ('backend', 'Autenticação', 60, false),
  ('backend', 'JavaScript', 58, false),
  ('backend', 'Python', 58, false),
  ('backend', 'Microsserviços', 58, false),
  ('backend', 'Code Review', 58, false),
  ('backend', 'Comunicação', 58, false),
  ('backend', 'Java', 56, false),
  ('backend', 'CI/CD', 56, false),
  ('backend', 'Colaboração', 56, false),
  ('backend', 'AWS', 54, false),
  ('backend', 'Design Patterns', 52, false),
  ('backend', 'Escalabilidade', 50, false),
  ('backend', 'Redis', 48, false),
  ('backend', 'SOLID', 48, false),
  ('backend', 'Spring Boot', 46, false),
  ('backend', 'MySQL', 46, false),
  ('backend', 'Segurança de Aplicações', 46, false),
  ('backend', 'Documentação', 46, false),
  ('backend', 'Express.js', 44, false),
  ('backend', 'MongoDB', 44, false),
  ('backend', 'Scrum', 44, false),
  ('backend', 'Otimização de Consultas', 42, false),
  ('backend', 'Mensageria', 42, false),
  ('backend', 'Kafka', 40, false),
  ('backend', 'C#', 40, false),
  ('backend', 'GraphQL', 40, false),
  ('backend', 'Linux', 40, false),
  ('backend', 'Clean Architecture', 40, false),
  ('backend', 'Caching', 38, false),
  ('backend', 'NoSQL', 38, false),
  ('backend', 'Observabilidade', 38, false),
  ('backend', 'Go', 34, false),
  ('backend', 'NestJS', 34, false),
  ('backend', 'Kubernetes', 34, false),
  ('backend', 'PHP', 32, false),
  ('backend', 'RabbitMQ', 32, false),
  ('backend', 'Django', 30, false),
  ('backend', 'OpenAPI', 30, false),
  ('backend', 'Serverless', 28, false),
  ('backend', 'FastAPI', 28, false),
  ('backend', 'Domain-Driven Design', 26, false),
  ('backend', 'Elasticsearch', 26, false),
  ('backend', 'Laravel', 24, false),
  ('backend', 'Kotlin', 22, false),
  ('backend', 'Flask', 22, false),
  ('backend', 'Prisma', 22, false),
  ('backend', 'gRPC', 22, false),
  ('backend', 'Ruby', 16, false),
  ('backend', 'Ruby on Rails', 14, false),

  -- -------------------------------------------------------------------- qa
  ('qa', 'Testes Automatizados', 84, true),
  ('qa', 'Qualidade de Software', 72, true),
  ('qa', 'Casos de Teste', 70, true),
  ('qa', 'Testes Manuais', 70, true),
  ('qa', 'Plano de Testes', 68, true),
  ('qa', 'Automação', 66, false),
  ('qa', 'Testes Funcionais', 64, false),
  ('qa', 'Resolução de Problemas', 64, false),
  ('qa', 'Comunicação', 64, false),
  ('qa', 'Testes de Regressão', 62, false),
  ('qa', 'Testes de API', 62, false),
  ('qa', 'Git', 62, false),
  ('qa', 'Jira', 62, false),
  ('qa', 'Documentação', 62, false),
  ('qa', 'Gestão de Defeitos', 60, false),
  ('qa', 'Selenium', 60, false),
  ('qa', 'Colaboração', 58, false),
  ('qa', 'SQL', 58, false),
  ('qa', 'Postman', 58, false),
  ('qa', 'Scrum', 58, false),
  ('qa', 'Cypress', 56, false),
  ('qa', 'CI/CD', 50, false),
  ('qa', 'REST', 48, false),
  ('qa', 'Playwright', 46, false),
  ('qa', 'Testes de Performance', 44, false),
  ('qa', 'BDD', 40, false),
  ('qa', 'JavaScript', 40, false),
  ('qa', 'Code Review', 40, false),
  ('qa', 'Python', 34, false),
  ('qa', 'Java', 34, false),
  ('qa', 'Robot Framework', 34, false),
  ('qa', 'Cucumber', 32, false),
  ('qa', 'TypeScript', 32, false),
  ('qa', 'Testes Mobile', 30, false),
  ('qa', 'JMeter', 30, false),
  ('qa', 'Docker', 30, false),
  ('qa', 'Jest', 28, false),
  ('qa', 'Acessibilidade', 26, false),
  ('qa', 'Linux', 26, false),
  ('qa', 'JUnit', 26, false),
  ('qa', 'Testes de Segurança', 26, false),
  ('qa', 'Appium', 24, false),
  ('qa', 'TestRail', 24, false),
  ('qa', 'Katalon Studio', 22, false),
  ('qa', 'SonarQube', 20, false),
  ('qa', 'REST Assured', 20, false),
  ('qa', 'k6', 18, false),
  ('qa', 'TestNG', 16, false),
  ('qa', 'Vitest', 14, false);

-- Trava contra erro de digitação: skill que não existe no catálogo sumiria
-- silenciosamente no JOIN e a trilha nasceria com peso faltando.
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(DISTINCT b.skill_name, ', ')
    INTO faltando
    FROM rumvia_baseline_spec b
    LEFT JOIN public.skills s ON s.canonical_name = b.skill_name
   WHERE s.id IS NULL;
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Skills inexistentes no catálogo: %', faltando;
  END IF;
END $$;

INSERT INTO public.track_skill_baselines (track_id, skill_id, seniority, importance, required_level, is_core)
SELECT
  t.id,
  s.id,
  sen.seniority,
  LEAST(b.base_imp + sen.delta, 100)::smallint,
  (CASE
     WHEN b.base_imp >= 71 THEN CASE sen.seniority WHEN 'junior' THEN 2 WHEN 'pleno' THEN 4 ELSE 5 END
     WHEN b.base_imp >= 55 THEN CASE sen.seniority WHEN 'junior' THEN 1 WHEN 'pleno' THEN 3 WHEN 'senior' THEN 4 ELSE 5 END
     WHEN b.base_imp >= 41 THEN CASE sen.seniority WHEN 'junior' THEN 1 WHEN 'pleno' THEN 3 ELSE 4 END
     ELSE CASE sen.seniority WHEN 'junior' THEN 0 WHEN 'pleno' THEN 2 ELSE 3 END
   END)::smallint,
  b.is_core
FROM rumvia_baseline_spec b
JOIN public.career_tracks t ON t.key = b.track_key
JOIN public.skills s ON s.canonical_name = b.skill_name
CROSS JOIN (VALUES ('junior', 0), ('pleno', 14), ('senior', 24), ('staff', 28)) AS sen(seniority, delta)
ON CONFLICT (track_id, skill_id, seniority) DO NOTHING;

DROP TABLE rumvia_baseline_spec;

-- ===========================================================================
-- 6. Catálogo de aprendizado (passo 3 de docs/ADICIONAR_TRILHA.md)
-- ===========================================================================
-- Onde o número real não é conhecido com certeza (preço de prova, duração),
-- fica NULL — a UI já trata null. Nunca inventar dado.

-- 6.1 Certificações que já existiam e também servem às trilhas novas:
--     acrescenta o track_id em vez de duplicar a linha.
UPDATE public.certifications_catalog c
   SET track_ids = c.track_ids || t.id
  FROM (VALUES
    ('Meta Front-End Developer Professional Certificate', 'frontend'),
    ('Meta Back-End Developer Professional Certificate',  'backend'),
    ('AWS Certified Developer Associate (DVA-C02)',       'backend'),
    ('OpenJS Node.js Services Developer (JSNSD)',         'backend'),
    ('Azure Developer Associate (AZ-204)',                'backend'),
    ('Certified Kubernetes Application Developer (CKAD)', 'backend')
  ) AS m(cert_name, track_key)
  JOIN public.career_tracks t ON t.key = m.track_key
 WHERE c.name = m.cert_name
   AND NOT (t.id = ANY (c.track_ids));

UPDATE public.courses_catalog c
   SET track_ids = c.track_ids || t.id
  FROM (VALUES
    ('The Complete JavaScript Course 2024',                       'frontend'),
    ('Next.js & React — The Complete Guide',                      'frontend'),
    ('TypeScript: The Complete Developer''s Guide',               'frontend'),
    ('GraphQL with React: The Complete Developers Guide',         'frontend'),
    ('Node.js, Express, MongoDB & More: The Complete Bootcamp',   'backend'),
    ('TypeScript: The Complete Developer''s Guide',               'backend')
  ) AS m(course_title, track_key)
  JOIN public.career_tracks t ON t.key = m.track_key
 WHERE c.title = m.course_title
   AND NOT (t.id = ANY (c.track_ids));

-- 6.2 Certificações novas
INSERT INTO public.certifications_catalog (name, issuer, level, track_ids, skill_ids, official_url, cost_usd, exam_duration_min, validity_months, difficulty)
SELECT v.name, v.issuer, v.level,
       ARRAY(SELECT id FROM public.career_tracks WHERE key = v.track_key),
       '{}'::uuid[],
       v.official_url, v.cost_usd, v.exam_duration_min, v.validity_months, v.difficulty
FROM (VALUES
  -- front-end
  ('Responsive Web Design', 'freeCodeCamp', 'Foundation', 'frontend', 'https://www.freecodecamp.org/learn/2022/responsive-web-design/', 0::numeric, NULL::integer, 0, 'iniciante'),
  ('JavaScript Algorithms and Data Structures', 'freeCodeCamp', 'Foundation', 'frontend', 'https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/', 0, NULL, 0, 'iniciante'),
  ('Google UX Design Professional Certificate', 'Google / Coursera', 'Professional', 'frontend', 'https://www.coursera.org/professional-certificates/google-ux-design', NULL, NULL, 0, 'iniciante'),
  ('Certified Professional in Accessibility Core Competencies (CPACC)', 'IAAP', 'Foundation', 'frontend', 'https://www.accessibilityassociation.org/s/certified-professional', NULL, NULL, 36, 'intermediario'),
  -- back-end
  ('OpenJS Node.js Application Developer (JSNAD)', 'OpenJS Foundation', 'Professional', 'backend', 'https://openjsf.org/certification/jsnad/', 395, 120, 36, 'intermediario'),
  ('Oracle Certified Professional: Java SE 17 Developer', 'Oracle', 'Professional', 'backend', 'https://education.oracle.com/java-se-17-developer/pexam_1Z0-829', NULL, NULL, 0, 'avancado'),
  ('Spring Certified Professional', 'Broadcom / Spring', 'Professional', 'backend', 'https://spring.io/training/certification', NULL, NULL, 0, 'avancado'),
  ('PCAP - Certified Associate in Python Programming', 'Python Institute', 'Associate', 'backend', 'https://pythoninstitute.org/pcap', NULL, NULL, 0, 'intermediario'),
  ('MongoDB Associate Developer', 'MongoDB', 'Associate', 'backend', 'https://learn.mongodb.com/pages/mongodb-associate-developer-exam', NULL, NULL, 36, 'intermediario'),
  -- qa
  ('ISTQB Certified Tester Foundation Level (CTFL)', 'ISTQB / BSTQB', 'Foundation', 'qa', 'https://www.istqb.org/certifications/certified-tester-foundation-level', NULL, NULL, 0, 'iniciante'),
  ('ISTQB Certified Tester Foundation Level - Agile Tester (CTFL-AT)', 'ISTQB', 'Foundation', 'qa', 'https://www.istqb.org/certifications/certified-tester-foundation-level-agile-tester-ctfl-at', NULL, NULL, 0, 'intermediario'),
  ('ISTQB Certified Tester Advanced Level - Test Analyst (CTAL-TA)', 'ISTQB', 'Advanced', 'qa', 'https://www.istqb.org/certifications/certified-tester-advanced-level-test-analyst-ctal-ta', NULL, NULL, 0, 'avancado'),
  ('ISTQB Certified Tester Advanced Level - Test Automation Engineer (CTAL-TAE)', 'ISTQB', 'Advanced', 'qa', 'https://www.istqb.org/certifications/certified-tester-advanced-level-test-automation-engineer-ctal-tae', NULL, NULL, 0, 'avancado')
) AS v(name, issuer, level, track_key, official_url, cost_usd, exam_duration_min, validity_months, difficulty)
WHERE NOT EXISTS (SELECT 1 FROM public.certifications_catalog c WHERE c.name = v.name);

-- 6.3 Cursos novos
INSERT INTO public.courses_catalog (title, provider, url, track_ids, skill_ids, format, price_type, duration_hours, language, level)
SELECT v.title, v.provider, v.url,
       ARRAY(SELECT id FROM public.career_tracks WHERE key = v.track_key),
       '{}'::uuid[],
       v.format, v.price_type, v.duration_hours, v.language, v.level
FROM (VALUES
  -- front-end
  ('React - The Complete Guide (incl. Next.js, Redux)', 'Udemy / Maximilian Schwarzmüller', 'https://www.udemy.com/course/react-the-complete-guide-incl-redux/', 'frontend', 'video', 'pago', 70::numeric, 'en', 'intermediario'),
  ('CSS - The Complete Guide (incl. Flexbox, Grid & Sass)', 'Udemy / Maximilian Schwarzmüller', 'https://www.udemy.com/course/css-the-complete-guide-incl-flexbox-grid-sass/', 'frontend', 'video', 'pago', 23, 'en', 'intermediario'),
  ('Formação Front-end', 'Alura', 'https://www.alura.com.br/formacao-front-end', 'frontend', 'video', 'assinatura', 40, 'pt', 'iniciante'),
  ('Learn Accessibility', 'web.dev / Google', 'https://web.dev/learn/accessibility', 'frontend', 'doc', 'gratuito', 6, 'en', 'intermediario'),
  ('JavaScript30', 'Wes Bos', 'https://javascript30.com/', 'frontend', 'hands_on', 'gratuito', 15, 'en', 'iniciante'),
  -- back-end
  ('Spring Guides', 'Spring / Broadcom', 'https://spring.io/guides', 'backend', 'doc', 'gratuito', 10, 'en', 'intermediario'),
  ('FastAPI Tutorial - User Guide', 'FastAPI', 'https://fastapi.tiangolo.com/tutorial/', 'backend', 'doc', 'gratuito', 8, 'en', 'intermediario'),
  ('Django for Everybody', 'University of Michigan / Coursera', 'https://www.coursera.org/specializations/django', 'backend', 'video', 'gratuito', 40, 'en', 'iniciante'),
  ('Formação Java e Orientação a Objetos', 'Alura', 'https://www.alura.com.br/formacao-java-orientacao-objetos', 'backend', 'video', 'assinatura', 40, 'pt', 'iniciante'),
  ('The System Design Primer', 'Donne Martin', 'https://github.com/donnemartin/system-design-primer', 'backend', 'doc', 'gratuito', 20, 'en', 'avancado'),
  -- qa
  ('Formação Teste de Software', 'Alura', 'https://www.alura.com.br/formacao-teste-software', 'qa', 'video', 'assinatura', 30, 'pt', 'iniciante'),
  ('Test Automation University', 'Applitools', 'https://testautomationu.applitools.com/', 'qa', 'video', 'gratuito', 40, 'en', 'intermediario'),
  ('Cypress Real World Testing', 'Cypress.io', 'https://learn.cypress.io/', 'qa', 'hands_on', 'gratuito', 10, 'en', 'intermediario'),
  ('Playwright - Getting Started', 'Microsoft', 'https://playwright.dev/docs/intro', 'qa', 'doc', 'gratuito', 6, 'en', 'intermediario'),
  ('Postman API Fundamentals Student Expert', 'Postman', 'https://academy.postman.com/postman-api-fundamentals-student-expert-certification', 'qa', 'hands_on', 'gratuito', 8, 'en', 'iniciante'),
  ('Robot Framework User Guide', 'Robot Framework Foundation', 'https://robotframework.org/robotframework/latest/RobotFrameworkUserGuide.html', 'qa', 'doc', 'gratuito', 8, 'en', 'intermediario'),
  ('k6 Documentation', 'Grafana Labs', 'https://grafana.com/docs/k6/latest/', 'qa', 'doc', 'gratuito', 4, 'en', 'intermediario')
) AS v(title, provider, url, track_key, format, price_type, duration_hours, language, level)
WHERE NOT EXISTS (SELECT 1 FROM public.courses_catalog c WHERE c.title = v.title);

-- ===========================================================================
-- 7. Reclassificar as vagas já ingeridas (passo 4 de docs/ADICIONAR_TRILHA.md)
-- ===========================================================================
-- Vagas de front, back e QA já estão na base com track_id NULL — foram
-- ingeridas quando nenhuma variante casava com o título. Aqui elas recebem a
-- trilha usando exatamente o critério do classificador em runtime
-- (`classifyTrack`): substring em title_normalized, termo mais longo vence.
-- Só mexe em vaga sem trilha; nenhuma classificação existente é sobrescrita.

WITH escolha AS (
  SELECT DISTINCT ON (jp.id)
         jp.id AS job_id,
         trv.track_id,
         trv.id  AS role_variant_id
    FROM public.job_postings jp
    JOIN public.track_role_variants trv ON trv.is_active
    CROSS JOIN LATERAL unnest(trv.search_terms) AS termo
   WHERE jp.track_id IS NULL
     AND jp.title_normalized IS NOT NULL
     AND termo <> ''
     AND position(lower(termo) IN jp.title_normalized) > 0
   ORDER BY jp.id, length(termo) DESC
)
UPDATE public.job_postings jp
   SET track_id = e.track_id,
       role_variant_id = e.role_variant_id
  FROM escolha e
 WHERE jp.id = e.job_id;

-- As materialized views (mv_skill_demand_by_track, mv_tool_demand,
-- mv_company_hiring, mv_salary_stats) NÃO são atualizadas aqui: o refresh usa
-- CONCURRENTLY e não roda dentro de transação. Depois de aplicar a migration:
--   SELECT public.refresh_market_views();
-- ou POST /api/public/refresh-market-views com o header x-cron-secret.
--
-- E para que as skills novas apareçam nas vagas já ingeridas, reprocessar a
-- extração (sem rebuscar nas fontes):  bun scripts/extract-skills.ts
