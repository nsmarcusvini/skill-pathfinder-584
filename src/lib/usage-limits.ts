/**
 * Vocabulário da trilha de uso e da cota diária — a parte que o CLIENTE também
 * precisa conhecer.
 *
 * Vive separado de `usage.server.ts` porque a tela precisa reconhecer o erro de
 * cota para mostrar a mensagem certa, e importar o módulo de servidor num
 * componente arrastaria `supabaseAdmin` para o bundle do browser.
 */

/**
 * Tipos de evento registrados. Não existe CHECK no banco (evento novo não
 * deveria exigir migration), então esta união é a única coisa que impede um
 * `job_detai` sem o `l` de virar uma série de dados órfã que ninguém percebe.
 */
export type UsageEvent =
  | "job_list"
  | "job_detail"
  | "apply_click"
  | "company_detail"
  | "salary_view"
  | "tool_detail"
  | "learning_catalog"
  | "cv_parse";

/**
 * Prefixo estável do erro de cota, no mesmo espírito de `PAYWALL_ERROR`.
 *
 * A tela de vagas renderiza `ErrorState` com texto FIXO ("Não foi possível
 * carregar as vagas") e ignora `error.message`. Sem um marcador, estourar a
 * cota apareceria como falha genérica — o usuário leria "deu erro" quando a
 * resposta certa é "você chegou ao teto de hoje". O prefixo é o que permite à
 * tela distinguir os dois casos.
 */
export const QUOTA_ERROR_PREFIX = "RUMVIA_LIMITE_DIARIO";

/**
 * Devolve a mensagem de cota se o erro for de cota, `null` caso contrário.
 * Chame antes de cair no texto genérico de erro.
 */
export function mensagemDeLimite(error: unknown): string | null {
  const texto = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  if (!texto || !texto.startsWith(QUOTA_ERROR_PREFIX)) return null;
  // Corta no PRIMEIRO ":" e não em todos: `split(":", 2)` no JavaScript trunca
  // em vez de juntar o resto, e comeria tudo depois do segundo dois-pontos —
  // a mensagem tem horário ("libera às 00:00") e perderia metade.
  const corte = texto.indexOf(":");
  const mensagem = corte >= 0 ? texto.slice(corte + 1).trim() : "";
  return mensagem || "Você atingiu o limite de uso de hoje.";
}

/**
 * Rótulo humano de cada tipo de evento, em minúsculas, para caber no meio de
 * uma frase ("limite de 300 buscas de vagas por dia") e também como legenda de
 * coluna em `/admin/clientes`.
 *
 * Mora aqui, e não em `usage.server.ts`, porque as duas pontas precisam do
 * mesmo texto: o servidor monta a mensagem de cota, e o admin mostra o que cada
 * cliente consumiu. Duas cópias divergiriam no dia em que um evento novo
 * entrasse em só uma delas.
 */
export const ROTULO_EVENTO_USO: Record<UsageEvent, string> = {
  job_list: "buscas de vagas",
  job_detail: "vagas abertas",
  apply_click: "cliques em vagas originais",
  company_detail: "empresas abertas",
  salary_view: "consultas de salário",
  tool_detail: "ferramentas abertas",
  learning_catalog: "consultas ao catálogo",
  cv_parse: "leituras de currículo",
};

/**
 * Versão tolerante do rótulo. `usage_daily.event_type` é texto livre no banco
 * (de propósito: evento novo não deveria exigir migration), então a tela pode
 * receber um tipo que este código ainda não conhece — e mostrar a chave crua é
 * melhor do que esconder a linha ou quebrar a página.
 */
export function rotuloEventoUso(event: string): string {
  return (ROTULO_EVENTO_USO as Record<string, string | undefined>)[event] ?? event;
}
