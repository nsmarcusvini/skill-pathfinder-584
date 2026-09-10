/**
 * SERVER-ONLY. Trilha de uso da conta paga e cota diária.
 *
 * Uma escrita serve a dois propósitos (migration 20260910141000):
 *
 *   PROVA  — `usage_daily` é a evidência de entrega numa contestação de cartão
 *            ou num Procon. Sobrevive à exclusão da conta de propósito.
 *   COTA   — o mesmo contador limita quanto dá para extrair por dia, que é o
 *            que impede alguém de baixar a base inteira dentro dos 7 dias do
 *            arrependimento e pedir o dinheiro de volta.
 *
 * `record_usage` grava e devolve o total do dia numa ida só ao banco: ler antes
 * e escrever depois seriam duas viagens e uma corrida entre elas.
 */
import { hashIpDaRequisicao } from "@/lib/request-ip.server";
import { QUOTA_ERROR_PREFIX, type UsageEvent } from "@/lib/usage-limits";

/**
 * Cota lida de `app_settings`, memoizada por 60s.
 *
 * Sem o memo isto seria um SELECT extra em CADA request de vaga — dobraria as
 * idas ao banco de uma tela de listagem para ler um número que muda uma vez por
 * trimestre. 60s é curto o bastante para um ajuste de teto valer quase na hora
 * (a alternativa, um cache eterno, exigiria redeploy para mudar cota — que é
 * exatamente o que a regra 1 do CLAUDE.md manda evitar).
 */
const memo = new Map<string, { valor: number; ate: number }>();
const MEMO_MS = 60_000;

/**
 * Rótulo em português para a mensagem de limite. O usuário precisa entender o
 * que ele estourou — "limite de 300 job_detail" não diz nada a ninguém.
 */
const ROTULO: Record<UsageEvent, string> = {
  job_list: "buscas de vagas",
  job_detail: "vagas abertas",
  apply_click: "cliques em vagas originais",
  company_detail: "empresas abertas",
  salary_view: "consultas de salário",
  tool_detail: "ferramentas abertas",
  learning_catalog: "consultas ao catálogo",
  cv_parse: "leituras de currículo",
};

async function cotaDiaria(event: UsageEvent): Promise<number> {
  const key = `usage_quota_${event}`;
  const agora = Date.now();
  const cached = memo.get(key);
  if (cached && cached.ate > agora) return cached.valor;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  // Sem linha em app_settings = evento sem teto. É o default certo: um evento
  // novo não pode nascer bloqueando ninguém porque alguém esqueceu de inserir
  // a configuração. Quem quiser limitar, insere a chave.
  const n = Number(data?.value);
  const valor = Number.isFinite(n) && n > 0 ? n : 0;
  memo.set(key, { valor, ate: agora + MEMO_MS });
  return valor;
}

/**
 * Grava o evento. Devolve o total do dia, ou `null` se a gravação falhou.
 *
 * NUNCA lança. Trilha é instrumentação: se o log quebrar, quem está pagando não
 * pode ficar sem o produto por causa disso.
 */
async function gravar(
  userId: string,
  event: UsageEvent,
  subjectId?: string | null,
): Promise<number | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("record_usage", {
      _user_id: userId,
      _event_type: event,
      // Omitido (não `null`) quando não há sujeito: `exactOptionalPropertyTypes`
      // recusa `undefined` explícito, e a função tem DEFAULT NULL — não passar
      // a chave dá exatamente o mesmo NULL no banco.
      ...(subjectId ? { _subject_id: subjectId } : {}),
      _ip_hash: await hashIpDaRequisicao(),
    });
    if (error) {
      console.error(`[usage] falha ao registrar ${event} de ${userId}: ${error.message}`);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (erro) {
    console.error(`[usage] falha ao registrar ${event}:`, erro);
    return null;
  }
}

/** Registra sem aplicar teto. Para evento que interessa como prova, não como limite. */
export async function registrarUso(
  userId: string,
  event: UsageEvent,
  subjectId?: string | null,
): Promise<void> {
  await gravar(userId, event, subjectId);
}

/**
 * Registra e aplica o teto diário. Lança quando estoura.
 *
 * ORDEM: grava PRIMEIRO, checa depois. O evento que estoura fica registrado —
 * é ele que mostra, no relatório, que a pessoa continuou martelando depois do
 * limite. E o contador devolvido já inclui a tentativa atual, então a
 * comparação é `total > limite`: com teto 300, o de número 300 passa e o 301 é
 * recusado.
 *
 * FALHA ABERTA: se `gravar` devolveu null, o banco de trilha está com problema
 * e não dá para saber o total. Negar acesso aí puniria o cliente por uma falha
 * nossa — a cota protege contra abuso, e abuso não é a hipótese mais provável
 * quando a infraestrutura está caindo.
 */
export async function registrarUsoComCota(
  userId: string,
  event: UsageEvent,
  subjectId?: string | null,
): Promise<void> {
  const total = await gravar(userId, event, subjectId);
  if (total === null) return;

  const limite = await cotaDiaria(event);
  if (limite <= 0 || total <= limite) return;

  console.warn(`[usage] cota estourada: ${userId} fez ${total} ${event} hoje (teto ${limite}).`);
  throw new Error(
    `${QUOTA_ERROR_PREFIX}: Você atingiu o limite de ${limite} ${ROTULO[event]} por dia. ` +
      `O contador zera à meia-noite (horário de Brasília). ` +
      `Se você precisa de mais que isso no uso normal, fale com a gente — o teto existe ` +
      `contra automação, não contra quem está procurando emprego.`,
  );
}
