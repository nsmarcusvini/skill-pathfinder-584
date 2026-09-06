/**
 * Identificação do fornecedor e versionamento dos Termos de uso, em um lugar
 * só — `termos.tsx` e o registro de aceite (`use-auth.tsx`) leem daqui.
 *
 * ⚠️ FORNECEDOR é PLACEHOLDER. O CDC exige identificação de quem vende — nome,
 * documento (CPF enquanto pessoa física) e um canal de contato — publicada
 * nos Termos. São dados pessoais reais que este código não pode inventar
 * (CLAUDE.md: "Nunca invente dado"). Preencha antes de considerar a página
 * pronta para produção; até lá, `termos.tsx` deixa isso visível como
 * pendência em vez de fingir que está preenchido.
 * Ver docs/roadmap/conformidade-cobranca.md, item 2.
 */
export const FORNECEDOR = {
  nome: null as string | null,
  documento: null as string | null,
  cidadeUf: null as string | null,
  contato: null as string | null,
};

/**
 * Versão do texto — muda sempre que o conteúdo dos Termos mudar de forma
 * relevante. É o valor gravado em `terms_acceptances.version`: sem isso, uma
 * mudança no texto não teria como provar qual versão cada pessoa aceitou.
 */
export const TERMOS_VERSAO = "2026-09-05";

/** Chave de localStorage que carrega o aceite do clique até existir sessão permanente. */
export const TERMOS_PENDENTES_KEY = "rumvia:termos_pendentes";
