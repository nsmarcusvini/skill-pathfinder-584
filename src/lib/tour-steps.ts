import {
  Award,
  Briefcase,
  Building2,
  FileText,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  PartyPopper,
  Settings,
  Sparkles,
  SlidersHorizontal,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Os 14 passos do tour guiado pós-cadastro. Dado puro — a UI vive em
 * components/rumvia/tour.tsx. Copy sem menção a trilha específica (regra 1
 * do CLAUDE.md: trilha é dado, não código).
 */
export interface TourStep {
  id: string;
  /** Casa com data-tour="..." no DOM. Ausente = card centrado, sem âncora. */
  anchor?: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "boas-vindas",
    title: "Bem-vindo ao RUMVIA",
    body: "Em menos de um minuto você vai saber o que tem em cada tela. Pode pular a qualquer momento.",
    icon: Sparkles,
  },
  {
    id: "filtros",
    anchor: "tour-topbar-filtros",
    title: "Trilha e segmento",
    body: "Estes dois seletores mandam em tudo. A trilha define contra qual carreira você é comparado; o segmento separa vagas do Brasil (BRL) das remotas globais (USD) — os números nunca misturam os dois.",
    icon: SlidersHorizontal,
  },
  {
    id: "dashboard",
    anchor: "tour-nav-dashboard",
    title: "Dashboard",
    body: "Seu painel: aderência em % à trilha escolhida, lacunas mais caras, empresas contratando e mediana salarial do recorte.",
    icon: LayoutDashboard,
  },
  {
    id: "cv",
    anchor: "tour-nav-cv",
    title: "Meu CV",
    body: "Envie seu currículo em PDF. O RUMVIA lê e extrai suas skills automaticamente — é daqui que sai toda a análise.",
    icon: FileText,
  },
  {
    id: "minhas-skills",
    anchor: "tour-nav-minhas-skills",
    title: "Minhas skills",
    body: "O que foi extraído do CV, com o nível de cada skill. Ajuste o que ficou errado e adicione o que faltou — cada correção recalcula sua aderência.",
    icon: ListChecks,
  },
  {
    id: "vagas",
    anchor: "tour-nav-vagas",
    title: "Vagas",
    body: "Vagas reais coletadas das empresas, com filtro de busca, cidade, remoto e faixa salarial. Cada vaga mostra o que você já tem e o que falta.",
    icon: Briefcase,
  },
  {
    id: "ferramentas",
    anchor: "tour-nav-ferramentas",
    title: "Stacks em Alta",
    body: "O ranking do que o mercado realmente pede na sua trilha. Compare duas, veja o que aparece junto e mande direto para o plano de estudos.",
    icon: Wrench,
  },
  {
    id: "empresas",
    anchor: "tour-nav-empresas",
    title: "Empresas",
    body: "Quem está contratando no seu recorte. Siga uma empresa para acompanhar as aberturas e ver o quanto seu perfil combina com ela.",
    icon: Building2,
  },
  {
    id: "salarios",
    anchor: "tour-nav-salarios",
    title: "Salários",
    body: "Faixas por senioridade, Brasil × remoto global, e o impacto de cada skill no salário. Tem simulador, e você pode contribuir com sua faixa, sempre de forma anônima.",
    icon: Wallet,
  },
  {
    id: "progresso",
    anchor: "tour-nav-progresso",
    title: "Progresso",
    body: "Seu plano de estudos em quadro kanban, gerado a partir das suas lacunas. Registre horas e acompanhe a sequência de dias no mapa de calor.",
    icon: Gauge,
  },
  {
    id: "certificacoes",
    anchor: "tour-nav-certificacoes",
    title: "Certificações",
    body: "Catálogo ordenado pelo impacto de cada certificação na sua aderência. Marque as que já tem e planeje as próximas.",
    icon: Award,
  },
  {
    id: "cursos",
    anchor: "tour-nav-cursos",
    title: "Cursos",
    body: "Cursos filtrados por formato, preço e idioma, com barra de progresso. Também entram no plano de estudos com um clique.",
    icon: GraduationCap,
  },
  {
    id: "conta",
    anchor: "tour-nav-conta",
    title: "Conta",
    body: "Seus dados, a troca de trilha e senioridade, e o controle da sua privacidade: exportar tudo em JSON ou apagar a conta.",
    icon: Settings,
  },
  {
    id: "fim",
    title: "Pronto",
    body: "O tour acabou. O próximo passo que mais muda seu resultado é enviar o CV — é ele que alimenta todas as telas.",
    icon: PartyPopper,
  },
];
