-- ============================== certifications_catalog
CREATE TABLE IF NOT EXISTS public.certifications_catalog (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  issuer           text NOT NULL,
  level            text,
  track_ids        uuid[] NOT NULL DEFAULT '{}',
  skill_ids        uuid[] NOT NULL DEFAULT '{}',
  official_url     text,
  cost_usd         numeric(8,2),
  exam_duration_min integer,
  validity_months  integer,
  difficulty       text CHECK (difficulty IN ('iniciante','intermediario','avancado','especialista')),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.certifications_catalog TO authenticated;
GRANT ALL ON public.certifications_catalog TO service_role;
ALTER TABLE public.certifications_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cert_cat_read" ON public.certifications_catalog FOR SELECT TO authenticated USING (is_active);

-- ============================== courses_catalog
CREATE TABLE IF NOT EXISTS public.courses_catalog (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL,
  provider       text NOT NULL,
  url            text,
  track_ids      uuid[] NOT NULL DEFAULT '{}',
  skill_ids      uuid[] NOT NULL DEFAULT '{}',
  format         text CHECK (format IN ('video','hands_on','livro','doc')),
  price_type     text CHECK (price_type IN ('gratuito','pago','assinatura')),
  duration_hours numeric(6,1),
  language       text NOT NULL DEFAULT 'pt',
  level          text,
  rating         numeric(3,1),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courses_catalog TO authenticated;
GRANT ALL ON public.courses_catalog TO service_role;
ALTER TABLE public.courses_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "course_cat_read" ON public.courses_catalog FOR SELECT TO authenticated USING (is_active);

-- ============================== user_certifications
CREATE TABLE IF NOT EXISTS public.user_certifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  certification_id   uuid REFERENCES public.certifications_catalog(id) ON DELETE SET NULL,
  custom_name        text,
  status             text NOT NULL DEFAULT 'planejada'
                       CHECK (status IN ('planejada','estudando','obtida','expirada')),
  obtained_at        date,
  expires_at         date,
  credential_url     text,
  credential_id      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_certifications TO authenticated;
GRANT ALL ON public.user_certifications TO service_role;
ALTER TABLE public.user_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ucert_own" ON public.user_certifications USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE INDEX IF NOT EXISTS idx_ucert_user ON public.user_certifications (user_id);

-- ============================== user_courses
CREATE TABLE IF NOT EXISTS public.user_courses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id       uuid REFERENCES public.courses_catalog(id) ON DELETE SET NULL,
  custom_title    text,
  status          text NOT NULL DEFAULT 'planejado'
                    CHECK (status IN ('planejado','em_andamento','concluido')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  started_at      date,
  completed_at    date,
  certificate_url text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_courses TO authenticated;
GRANT ALL ON public.user_courses TO service_role;
ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ucourse_own" ON public.user_courses USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE);
CREATE INDEX IF NOT EXISTS idx_ucourse_user ON public.user_courses (user_id);

-- ============================== seed: career_tracks ids helper
-- We reference tracks by key to avoid hardcoding UUIDs
-- Certifications seed
INSERT INTO public.certifications_catalog (name, issuer, level, track_ids, skill_ids, official_url, cost_usd, exam_duration_min, validity_months, difficulty) VALUES
-- devops
('Certified Kubernetes Administrator (CKA)', 'Linux Foundation', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/', 395, 120, 36, 'avancado'),
('Certified Kubernetes Application Developer (CKAD)', 'Linux Foundation', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key IN ('devops','fullstack')), '{}', 'https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/', 395, 120, 36, 'intermediario'),
('Certified Kubernetes Security Specialist (CKS)', 'Linux Foundation', 'Expert', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://training.linuxfoundation.org/certification/certified-kubernetes-security-specialist/', 395, 120, 36, 'especialista'),
('AWS Solutions Architect Associate (SAA-C03)', 'Amazon Web Services', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://aws.amazon.com/certification/certified-solutions-architect-associate/', 300, 130, 36, 'intermediario'),
('AWS DevOps Engineer Professional', 'Amazon Web Services', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://aws.amazon.com/certification/certified-devops-engineer-professional/', 300, 180, 36, 'avancado'),
('HashiCorp Certified: Terraform Associate', 'HashiCorp', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://www.hashicorp.com/certifications/terraform-associate', 70, 60, 24, 'intermediario'),
('Google Cloud Professional Cloud DevOps Engineer', 'Google Cloud', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://cloud.google.com/learn/certification/cloud-devops-engineer', 200, 120, 24, 'avancado'),
('AZ-104: Microsoft Azure Administrator', 'Microsoft', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://learn.microsoft.com/en-us/certifications/azure-administrator/', 165, 100, 0, 'intermediario'),
('AZ-400: Designing and Implementing DevOps Solutions', 'Microsoft', 'Expert', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://learn.microsoft.com/en-us/certifications/devops-engineer/', 165, 120, 0, 'avancado'),
('Prometheus Certified Associate (PCA)', 'Linux Foundation', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://training.linuxfoundation.org/certification/prometheus-certified-associate/', 250, 90, 36, 'intermediario'),
('Linux Foundation Certified System Administrator (LFCS)', 'Linux Foundation', 'Foundation', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'https://training.linuxfoundation.org/certification/linux-foundation-certified-sysadmin-lfcs/', 395, 120, 36, 'intermediario'),
-- data_engineer
('Google Cloud Professional Data Engineer', 'Google Cloud', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'https://cloud.google.com/learn/certification/data-engineer', 200, 120, 24, 'avancado'),
('AWS Certified Data Engineer Associate', 'Amazon Web Services', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'https://aws.amazon.com/certification/certified-data-engineer-associate/', 300, 130, 36, 'intermediario'),
('Databricks Certified Data Engineer Associate', 'Databricks', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'https://www.databricks.com/learn/certification/data-engineer-associate', 200, 90, 0, 'intermediario'),
('Databricks Certified Data Engineer Professional', 'Databricks', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'https://www.databricks.com/learn/certification/data-engineer-professional', 200, 120, 0, 'avancado'),
('SnowPro Core Certification', 'Snowflake', 'Core', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'https://www.snowflake.com/certifications/', 175, 115, 24, 'intermediario'),
('dbt Analytics Engineering Certification', 'dbt Labs', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'https://www.getdbt.com/certifications/analytics-engineer', 200, 120, 24, 'intermediario'),
('Confluent Certified Developer for Apache Kafka', 'Confluent', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'https://www.confluent.io/certification/', 200, 120, 24, 'avancado'),
('Azure Data Engineer Associate (DP-203)', 'Microsoft', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'https://learn.microsoft.com/en-us/certifications/azure-data-engineer/', 165, 100, 0, 'intermediario'),
-- fullstack
('AWS Certified Developer Associate (DVA-C02)', 'Amazon Web Services', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'https://aws.amazon.com/certification/certified-developer-associate/', 300, 130, 36, 'intermediario'),
('Meta Front-End Developer Professional Certificate', 'Meta', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'https://www.coursera.org/professional-certificates/meta-front-end-developer', 0, 0, 0, 'iniciante'),
('Meta Back-End Developer Professional Certificate', 'Meta', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'https://www.coursera.org/professional-certificates/meta-back-end-developer', 0, 0, 0, 'iniciante'),
('OpenJS Node.js Services Developer (JSNSD)', 'OpenJS Foundation', 'Professional', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'https://openjsf.org/certification/jsnsd/', 395, 120, 36, 'intermediario'),
('Azure Developer Associate (AZ-204)', 'Microsoft', 'Associate', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'https://learn.microsoft.com/en-us/certifications/azure-developer/', 165, 100, 0, 'intermediario');

-- ============================== seed: courses
INSERT INTO public.courses_catalog (title, provider, url, track_ids, skill_ids, format, price_type, duration_hours, language, level) VALUES
-- devops
('Docker & Kubernetes: The Practical Guide', 'Udemy / Maximilian Schwarzmüller', 'https://www.udemy.com/course/docker-kubernetes-the-practical-guide/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'video', 'pago', 24, 'en', 'intermediario'),
('DevOps with AWS - CodePipeline, CodeBuild, CodeDeploy', 'Udemy', 'https://www.udemy.com/course/devops-with-aws/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'video', 'pago', 10, 'en', 'intermediario'),
('Terraform on AWS EKS Kubernetes IaC DevOps - Masterclass', 'Udemy', 'https://www.udemy.com/course/terraform-on-aws-eks-kubernetes-iac-sre/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'video', 'pago', 45, 'en', 'avancado'),
('Linux Foundation: Introduction to Kubernetes (LFS158x)', 'edX / Linux Foundation', 'https://www.edx.org/learn/kubernetes/the-linux-foundation-introduction-to-kubernetes', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'video', 'gratuito', 14, 'en', 'iniciante'),
('Prometheus e Grafana: Monitoramento de Aplicações', 'Alura', 'https://www.alura.com.br/cursos-online-devops/monitoramento', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'video', 'assinatura', 12, 'pt', 'intermediario'),
('GitOps com ArgoCD e Flux', 'KodeKloud', 'https://kodekloud.com/courses/gitops-argocd/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'hands_on', 'pago', 8, 'en', 'intermediario'),
('Helm Charts - Kubernetes Package Manager', 'KodeKloud', 'https://kodekloud.com/courses/helm-for-beginners/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'hands_on', 'pago', 5, 'en', 'intermediario'),
('Site Reliability Engineering (SRE) Fundamentals', 'Google Cloud Skills Boost', 'https://www.cloudskillsboost.google/paths/20', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'devops'), '{}', 'hands_on', 'gratuito', 20, 'en', 'avancado'),
-- data_engineer
('Apache Spark with Python – Pyspark', 'Udemy', 'https://www.udemy.com/course/taming-big-data-with-apache-spark-hands-on/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'video', 'pago', 14, 'en', 'intermediario'),
('Data Engineering Zoomcamp', 'DataTalks.Club', 'https://github.com/DataTalksClub/data-engineering-zoomcamp', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'video', 'gratuito', 40, 'en', 'intermediario'),
('dbt Fundamentals', 'dbt Labs', 'https://learn.getdbt.com/courses/dbt-fundamentals', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'video', 'gratuito', 5, 'en', 'iniciante'),
('Apache Kafka Series – Learn Apache Kafka for Beginners v3', 'Udemy / Conduktor', 'https://www.udemy.com/course/apache-kafka/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'video', 'pago', 8, 'en', 'iniciante'),
('Databricks Lakehouse Fundamentals', 'Databricks', 'https://www.databricks.com/learn/training/databricks-lakehouse-fundamentals', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'video', 'gratuito', 4, 'en', 'iniciante'),
('Snowflake: The Complete Masterclass', 'Udemy', 'https://www.udemy.com/course/snowflake-masterclass/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'video', 'pago', 12, 'en', 'intermediario'),
('Engenharia de Dados na Prática', 'Alura', 'https://www.alura.com.br/formacao-engenharia-dados', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'video', 'assinatura', 30, 'pt', 'intermediario'),
('Airflow Fundamentals', 'Astronomer', 'https://academy.astronomer.io/path/airflow-101', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'data_engineer'), '{}', 'video', 'gratuito', 8, 'en', 'iniciante'),
-- fullstack
('The Complete JavaScript Course 2024', 'Udemy / Jonas Schmedtmann', 'https://www.udemy.com/course/the-complete-javascript-course/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'video', 'pago', 69, 'en', 'iniciante'),
('Next.js & React — The Complete Guide', 'Udemy / Maximilian Schwarzmüller', 'https://www.udemy.com/course/nextjs-react-the-complete-guide/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'video', 'pago', 25, 'en', 'intermediario'),
('Node.js, Express, MongoDB & More: The Complete Bootcamp', 'Udemy / Jonas Schmedtmann', 'https://www.udemy.com/course/nodejs-express-mongodb-bootcamp/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'video', 'pago', 42, 'en', 'intermediario'),
('Full Stack Open', 'University of Helsinki', 'https://fullstackopen.com/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'doc', 'gratuito', 60, 'en', 'intermediario'),
('TypeScript: The Complete Developer''s Guide', 'Udemy / Stephen Grider', 'https://www.udemy.com/course/typescript-the-complete-developers-guide/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'video', 'pago', 27, 'en', 'intermediario'),
('Desenvolvimento Web com Alura', 'Alura', 'https://www.alura.com.br/formacao-programador-fullstack', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'video', 'assinatura', 60, 'pt', 'iniciante'),
('React com TypeScript na Prática', 'Rocketseat', 'https://rocketseat.com.br/discover', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'video', 'gratuito', 10, 'pt', 'intermediario'),
('GraphQL with React: The Complete Developers Guide', 'Udemy / Stephen Grider', 'https://www.udemy.com/course/graphql-with-react-course/', ARRAY(SELECT id FROM public.career_tracks WHERE key = 'fullstack'), '{}', 'video', 'pago', 13, 'en', 'avancado');
