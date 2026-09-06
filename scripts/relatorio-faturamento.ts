/**
 * Relatório de faturamento por mês — a base numérica para a conversa com o
 * contador (docs/roadmap/conformidade-cobranca.md, item 3). Só lê, não grava
 * nada.
 *
 *   bun run scripts/relatorio-faturamento.ts
 *   bun run scripts/relatorio-faturamento.ts --csv relatorio.csv
 *
 * Por que ler de `billing_events` e não de `subscriptions`: `subscriptions`
 * guarda só o estado ATUAL de cada assinatura (uma linha por contrato).
 * `billing_events` é o log cru de cada evento que o Asaas mandou — é o único
 * lugar com um rastro de CADA cobrança confirmada e CADA estorno, que é o
 * que faturamento por mês exige. Não existe uma tabela de "pagamentos"
 * própria; o dado vive dentro do `payload` jsonb de cada webhook.
 *
 * Uma cobrança pode gerar PAYMENT_CONFIRMED e, mais tarde, PAYMENT_RECEIVED
 * (quando o dinheiro é liquidado) — dois eventos para o MESMO dinheiro.
 * Contar os dois somaria a cobrança em dobro. Este script pega só o primeiro
 * evento de confirmação por `payment.id`, o mesmo critério que
 * `webhook.server.ts` usa para liberar o acesso (o que chegar primeiro).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const csvPathArg = process.argv.indexOf("--csv");
const csvPath = csvPathArg >= 0 ? process.argv[csvPathArg + 1] : null;

interface Linha {
  mes: string;
  devMode: boolean;
  cobrancas: number;
  bruto: number;
  liquidoAsaas: number;
  estornado: number;
  qtdEstornos: number;
  qtdChargebacks: number;
}

type EventoRow = {
  event_type: string;
  dev_mode: boolean;
  received_at: string;
  payload: {
    payment?: { id?: string; value?: number; netValue?: number };
    dateCreated?: string;
  };
};

const { data: eventos, error } = await supabaseAdmin
  .from("billing_events")
  .select("event_type, dev_mode, received_at, payload")
  .in("event_type", [
    "PAYMENT_CONFIRMED",
    "PAYMENT_RECEIVED",
    "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK_REQUESTED",
  ])
  .order("received_at", { ascending: true });

if (error) {
  console.error(`Erro lendo billing_events: ${error.message}`);
  process.exit(1);
}

const eventosVistos = (eventos ?? []) as EventoRow[];

// Primeiro evento de confirmação por payment.id — evita contar
// CONFIRMED + RECEIVED do mesmo dinheiro duas vezes.
const pagamentosPorId = new Map<
  string,
  { valor: number; liquido: number; data: string; devMode: boolean }
>();
for (const ev of eventosVistos) {
  if (ev.event_type !== "PAYMENT_CONFIRMED" && ev.event_type !== "PAYMENT_RECEIVED") continue;
  const paymentId = ev.payload.payment?.id;
  if (!paymentId || pagamentosPorId.has(paymentId)) continue;
  pagamentosPorId.set(paymentId, {
    valor: ev.payload.payment?.value ?? 0,
    liquido: ev.payload.payment?.netValue ?? 0,
    data: ev.payload.dateCreated ?? ev.received_at,
    devMode: ev.dev_mode,
  });
}

const estornosPorId = new Map<string, number>();
const chargebacksPorId = new Map<string, number>();
for (const ev of eventosVistos) {
  const paymentId = ev.payload.payment?.id;
  if (!paymentId) continue;
  if (ev.event_type === "PAYMENT_REFUNDED") {
    estornosPorId.set(
      paymentId,
      (estornosPorId.get(paymentId) ?? 0) + (ev.payload.payment?.value ?? 0),
    );
  }
  if (ev.event_type === "PAYMENT_CHARGEBACK_REQUESTED") {
    chargebacksPorId.set(paymentId, (chargebacksPorId.get(paymentId) ?? 0) + 1);
  }
}

const porMes = new Map<string, Linha>();
for (const [paymentId, p] of pagamentosPorId) {
  const mes = p.data.slice(0, 7); // YYYY-MM
  const chave = `${mes}|${p.devMode}`;
  const linha = porMes.get(chave) ?? {
    mes,
    devMode: p.devMode,
    cobrancas: 0,
    bruto: 0,
    liquidoAsaas: 0,
    estornado: 0,
    qtdEstornos: 0,
    qtdChargebacks: 0,
  };
  linha.cobrancas += 1;
  linha.bruto += p.valor;
  linha.liquidoAsaas += p.liquido;
  const estorno = estornosPorId.get(paymentId);
  if (estorno) {
    linha.estornado += estorno;
    linha.qtdEstornos += 1;
  }
  if (chargebacksPorId.get(paymentId)) linha.qtdChargebacks += 1;
  porMes.set(chave, linha);
}

const linhas = [...porMes.values()].sort(
  (a, b) => a.mes.localeCompare(b.mes) || Number(a.devMode) - Number(b.devMode),
);

if (linhas.length === 0) {
  console.log("Nenhum pagamento confirmado registrado ainda.");
  process.exit(0);
}

console.log(
  "\nmês      ambiente  cobranças   bruto (R$)   líquido Asaas   estornado   qtd.estorno   chargebacks",
);
console.log("-".repeat(100));

let totalBruto = 0;
let totalLiquido = 0;
let totalEstornado = 0;

for (const l of linhas) {
  totalBruto += l.bruto;
  totalLiquido += l.liquidoAsaas;
  totalEstornado += l.estornado;
  console.log(
    `${l.mes}   ${l.devMode ? "sandbox " : "produção"}  ${String(l.cobrancas).padStart(9)}   ` +
      `${l.bruto.toFixed(2).padStart(10)}   ${l.liquidoAsaas.toFixed(2).padStart(13)}   ` +
      `${l.estornado.toFixed(2).padStart(9)}   ${String(l.qtdEstornos).padStart(11)}   ` +
      `${String(l.qtdChargebacks).padStart(11)}`,
  );
}

console.log("-".repeat(100));
console.log(
  `TOTAL: bruto R$ ${totalBruto.toFixed(2)} · líquido Asaas R$ ${totalLiquido.toFixed(2)} · ` +
    `estornado R$ ${totalEstornado.toFixed(2)} · líquido após estorno R$ ${(totalBruto - totalEstornado).toFixed(2)}`,
);
console.log(
  "\n⚠ Isto é o que o Asaas moveu, não é nota fiscal nem declaração pronta — linhas 'sandbox'\n" +
    "  são teste e não entram em nenhuma apuração real. Confirme com o contador o tratamento\n" +
    "  tributário (pessoa física vs. CNPJ/MEI) antes de usar estes números numa declaração.",
);

if (csvPath) {
  const cabecalho =
    "mes,ambiente,cobrancas,bruto,liquido_asaas,estornado,qtd_estornos,qtd_chargebacks";
  const corpo = linhas.map((l) =>
    [
      l.mes,
      l.devMode ? "sandbox" : "producao",
      l.cobrancas,
      l.bruto.toFixed(2),
      l.liquidoAsaas.toFixed(2),
      l.estornado.toFixed(2),
      l.qtdEstornos,
      l.qtdChargebacks,
    ].join(","),
  );
  await Bun.write(csvPath, [cabecalho, ...corpo].join("\n") + "\n");
  console.log(`\n✓ CSV gravado em ${csvPath}`);
}
