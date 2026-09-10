/**
 * Identificação do fornecedor e versionamento dos Termos de uso, em um lugar
 * só — `termos.tsx` e o registro de aceite (`use-auth.tsx`) leem daqui.
 *
 * Pessoa física, publicado no Termos porque o CDC exige identificação de
 * quem vende (docs/roadmap/conformidade-cobranca.md, item 2). Preenchido
 * pelo próprio responsável em 2026-09-07, com confirmação explícita de que
 * topa publicar o CPF.
 */
export const FORNECEDOR = {
  nome: "Marcus Vinicius Nascimento Souza",
  documento: "CPF 526.985.108-38",
  cidadeUf: "São Paulo/SP",
  contato: "rumvia2026@gmail.com",
};

/**
 * Versão do texto — muda sempre que o conteúdo dos Termos mudar de forma
 * relevante. É o valor gravado em `terms_acceptances.version`: sem isso, uma
 * mudança no texto não teria como provar qual versão cada pessoa aceitou.
 */
export const TERMOS_VERSAO = "2026-09-10";

/**
 * Histórico das versões, para a próxima pessoa entender por que a data mudou.
 * Não vai para a tela — é `terms_acceptances.version` que prova o aceite; isto
 * é a memória de o que cada valor significa.
 *
 *   2026-09-05  Texto original (fornecedor, ciclo, renovação, arrependimento).
 *   2026-09-10  + "Nova assinatura após reembolso" e + "Uso justo". A seção de
 *               arrependimento NÃO mudou: quem desiste continua recebendo o
 *               valor cheio. O que passou a estar escrito é a consequência —
 *               não vendemos outra assinatura à mesma pessoa sem liberação
 *               manual — e o teto diário contra extração automatizada.
 *               Quem aceitou 2026-09-05 mantém aquele aceite: a versão nova
 *               vale para quem se cadastrar a partir daqui, como a seção
 *               "Alterações" promete.
 *   2026-09-10  (mesma data, segunda alteração) "Como cancelar" deixou de
 *               prometer corte imediato do acesso: o ciclo já pago passou a ser
 *               honrado até o fim, e só a renovação para na hora. Mudança a
 *               FAVOR do consumidor, então quem aceitou a versão de mais cedo
 *               não fica em condição pior — por isso não se criou um sufixo de
 *               versão. Se algum dia uma segunda alteração no mesmo dia for
 *               restritiva, aí a chave de versão precisa deixar de ser só a
 *               data.
 */

/** Chave de localStorage que carrega o aceite do clique até existir sessão permanente. */
export const TERMOS_PENDENTES_KEY = "rumvia:termos_pendentes";
