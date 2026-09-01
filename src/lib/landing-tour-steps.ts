import {
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  ListOrdered,
  PartyPopper,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { AVISO_ACESSO_PAGO } from "@/lib/plan-copy";
import type { TourStep } from "@/lib/tour-steps";

/**
 * Tour do visitante anônimo, cinco paradas pela landing — reaproveita o tipo
 * `TourStep` do tour da conta (mesmo componente de UI em components/rumvia/tour.tsx,
 * outro controlador: use-landing-tour.tsx). Copy sem menção a trilha específica
 * (regra 1 do CLAUDE.md).
 */
export const LANDING_TOUR_STEPS: TourStep[] = [
  {
    id: "boas-vindas",
    title: "Como o RUMVIA funciona",
    body: "Cinco paradas rápidas pelo site, menos de um minuto. Pode pular quando quiser.",
    icon: Sparkles,
  },
  {
    id: "upload",
    anchor: "tour-landing-upload",
    title: "Envie seu currículo",
    body: "Arraste o PDF aqui. A leitura usa um dicionário próprio, sem IA generativa — nada do seu CV sai daqui. Resultado em segundos, sem cadastro.",
    icon: UploadCloud,
  },
  {
    id: "como-funciona",
    anchor: "tour-landing-como-funciona",
    title: "O processo",
    body: "Três passos: envie o CV, escolha sua trilha de carreira e veja o gap com um plano de estudos já priorizado pela demanda real do mercado.",
    icon: ListOrdered,
  },
  {
    id: "funcionalidades",
    anchor: "tour-landing-funcionalidades",
    title: "O que você recebe",
    body: "Score de aderência, as ferramentas mais pedidas na sua trilha, faixa salarial real e um plano de estudos em kanban — tudo baseado em vagas reais.",
    icon: LayoutDashboard,
  },
  {
    id: "planos",
    anchor: "tour-landing-planos",
    title: "Prévia grátis, conta paga",
    body: `A prévia — score e amostra das lacunas — roda sem cadastro. ${AVISO_ACESSO_PAGO}`,
    icon: CreditCard,
  },
  {
    id: "faq",
    anchor: "tour-landing-faq",
    title: "Dúvidas comuns",
    body: "Preço, como analisamos o CV, de onde vêm as vagas e o que fazemos com seus dados — está tudo respondido aqui embaixo.",
    icon: HelpCircle,
  },
  {
    id: "fim",
    title: "Pronto",
    body: "Agora você já sabe onde fica cada coisa. O próximo passo que mais importa é enviar o currículo — é ele que gera sua análise.",
    icon: PartyPopper,
    finalCta: { label: "Analisar meu CV", to: "/analise", search: { cv: undefined } },
  },
];
