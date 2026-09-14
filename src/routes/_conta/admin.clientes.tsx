import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { Sparkline } from "@/components/rumvia/sparkline";
import { EmptyState, LoadingState, ErrorState } from "@/components/rumvia/states";
import { formatCents } from "@/components/rumvia/paywall";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listSubscribers,
  listOrphanPayments,
  getSubscriberDetail,
  type AdminPagamento,
  type AdminSubscriber,
  type AdminSubscriberDetail,
  type AdminUsageSummary,
} from "@/lib/admin.functions";
import { rotuloCiclo, rotuloMetodo, rotuloStatus } from "@/lib/plan-copy";
import { rotuloEventoUso } from "@/lib/usage-limits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_conta/admin/clientes")({
  component: AdminClientesPage,
});

// ─── Regras de leitura da tela ────────────────────────────────────────────────

/**
 * Silêncio que caracteriza risco de churn. 14 dias é meio ciclo mensal: quem
 * pagou e passou duas semanas sem abrir raramente volta sozinho — é o momento
 * em que um e-mail ainda salva a renovação, e depois dele já não salva.
 */
const DIAS_PARA_RISCO = 14;

/**
 * Carência de quem nunca usou. Cobrar "ele não usa" de alguém que pagou ontem
 * seria ruído: a lista encheria de falso positivo toda vez que entrasse cliente
 * novo, e a métrica que interessa (quem esfriou) sumiria no meio.
 */
const CARENCIA_ATIVACAO = 7;

const DIA_MS = 86_400_000;

function fmtData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * `usage_daily.day` vem como data de calendário (`YYYY-MM-DD`) no fuso de
 * Brasília. Ancorar ao meio-dia UTC evita o clássico erro de um dia para menos:
 * `new Date("2026-09-12")` é meia-noite UTC, que em Brasília ainda é dia 11.
 */
function diaParaData(dia: string): Date {
  return new Date(`${dia}T12:00:00Z`);
}

/** Dias corridos decorridos desde a data. Negativo quando ela está no futuro. */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DIA_MS);
}

function haQuantoTempo(iso: string | null): string {
  const d = diasDesde(iso);
  if (d === null) return "—";
  if (d < 0) return "agora";
  if (d === 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  const meses = Math.floor(d / 30);
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}

/** "3 meses", "1 ano e 2 meses". Duração, não distância — é o tempo de casa. */
function duracaoDesde(iso: string | null): string {
  const d = diasDesde(iso);
  if (d === null) return "—";
  if (d < 1) return "menos de um dia";
  if (d < 30) return `${d} ${d === 1 ? "dia" : "dias"}`;
  const meses = Math.floor(d / 30);
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const parteAnos = `${anos} ${anos === 1 ? "ano" : "anos"}`;
  return resto ? `${parteAnos} e ${resto} ${resto === 1 ? "mês" : "meses"}` : parteAnos;
}

/**
 * Último sinal de vida do cliente.
 *
 * Prefere o uso registrado, e só cai no login quando não há nenhum: login sem
 * uso é presença, não consumo — quem abre a aplicação e fecha não recebeu
 * valor, e tratar isso como uso esconderia exatamente o cliente que está
 * prestes a cancelar.
 */
function ultimoSinal(c: AdminSubscriber): { at: string | null; origem: "uso" | "login" | null } {
  if (c.usage.ultimoDia) return { at: diaParaData(c.usage.ultimoDia).toISOString(), origem: "uso" };
  if (c.lastSignInAt) return { at: c.lastSignInAt, origem: "login" };
  return { at: null, origem: null };
}

/**
 * Cliente pagante que parou de usar. Sandbox e admin ficam de fora: um não é
 * dinheiro e o outro não cancela — os dois só sujariam o número.
 */
function emRisco(c: AdminSubscriber): boolean {
  if (!c.accessNow || c.devMode || c.isAdmin) return false;
  const sinal = ultimoSinal(c);
  if (sinal.origem === "uso") return (diasDesde(sinal.at) ?? 0) >= DIAS_PARA_RISCO;
  const tempoDeCasa = diasDesde(c.firstActivatedAt ?? c.createdAt) ?? 0;
  return tempoDeCasa >= CARENCIA_ATIVACAO;
}

function textoDeUso(c: AdminSubscriber): string {
  const sinal = ultimoSinal(c);
  if (sinal.origem === "uso") return `último uso ${haQuantoTempo(sinal.at)}`;
  if (sinal.origem === "login") return `sem uso · entrou ${haQuantoTempo(sinal.at)}`;
  return "nunca entrou";
}

type Filtro =
  | "ativos"
  | "risco"
  | "inadimplentes"
  | "saindo"
  | "pendentes"
  | "reembolsados"
  | "cancelados"
  | "todos";

const FILTROS: Array<{ key: Filtro; label: string; conta: (c: AdminSubscriber) => boolean }> = [
  { key: "ativos", label: "Com acesso", conta: (c) => c.accessNow },
  { key: "risco", label: "Pagando e sem usar", conta: emRisco },
  { key: "inadimplentes", label: "Cobrança falhou", conta: (c) => c.status === "past_due" },
  {
    key: "saindo",
    label: "Cancelamento agendado",
    conta: (c) => c.cancelAtPeriodEnd && c.accessNow,
  },
  { key: "pendentes", label: "Aguardando pagamento", conta: (c) => c.status === "pending" },
  /**
   * Dinheiro que voltou, por qualquer via. Olha `refundedCount` e não
   * `status === "refunded"` de propósito: o status guarda só o desfecho da
   * assinatura, então quem foi reembolsado e assinou de novo já não aparece
   * ali — e é exatamente esse caso que vale a pena ver.
   */
  { key: "reembolsados", label: "Reembolsados", conta: (c) => c.refundedCount > 0 },
  {
    key: "cancelados",
    label: "Encerrados",
    conta: (c) => !c.accessNow && c.status !== "pending",
  },
  { key: "todos", label: "Todos", conta: () => true },
];

/**
 * Ciclo é eixo INDEPENDENTE do estado do contrato: "com acesso" e "anual" são
 * perguntas diferentes, e enfiar as duas no mesmo seletor impediria a
 * combinação que mais interessa — quantos anuais estão ativos.
 */
type FiltroCiclo = "todos" | "MONTHLY" | "QUARTERLY" | "YEARLY";

const CICLOS: Array<{ key: FiltroCiclo; label: string }> = [
  { key: "todos", label: "Todos os ciclos" },
  { key: "MONTHLY", label: "Mensal" },
  { key: "QUARTERLY", label: "Trimestral" },
  { key: "YEARLY", label: "Anual" },
];

type Ordem = "recentes" | "receita" | "uso" | "ocioso" | "renovacao";

const ORDENS: Array<{ key: Ordem; label: string }> = [
  { key: "recentes", label: "Mais recentes" },
  { key: "receita", label: "Maior receita recebida" },
  { key: "uso", label: "Quem mais usa" },
  { key: "ocioso", label: "Quem mais sumiu" },
  { key: "renovacao", label: "Renovação mais próxima" },
];

function comparar(ordem: Ordem, a: AdminSubscriber, b: AdminSubscriber): number {
  switch (ordem) {
    case "receita":
      return b.paidTotalCents - a.paidTotalCents;
    case "uso":
      return b.usage.total - a.usage.total;
    case "ocioso": {
      // Sem sinal nenhum é o caso mais extremo de "sumiu": vai para o topo.
      const da = diasDesde(ultimoSinal(a).at) ?? Number.POSITIVE_INFINITY;
      const db = diasDesde(ultimoSinal(b).at) ?? Number.POSITIVE_INFINITY;
      return db - da;
    }
    case "renovacao": {
      const fim = (c: AdminSubscriber) =>
        c.currentPeriodEnd ? new Date(c.currentPeriodEnd).getTime() : Number.POSITIVE_INFINITY;
      return fim(a) - fim(b);
    }
    case "recentes":
    default:
      return b.createdAt.localeCompare(a.createdAt);
  }
}

// ─── Página ───────────────────────────────────────────────────────────────────

function AdminClientesPage() {
  const carregar = useServerFn(listSubscribers);
  const carregarOrfas = useServerFn(listOrphanPayments);
  const [busca, setBusca] = React.useState("");
  /**
   * `null` = ainda no padrão automático. Guardar a escolha só depois do
   * primeiro clique é o que permite abrir em "Com acesso" quando existe alguém
   * ativo e cair em "Todos" quando não existe — sem `useEffect` e sem a tela
   * trocar de filtro sozinha depois que a pessoa escolheu um.
   */
  const [filtro, setFiltro] = React.useState<Filtro | null>(null);
  const [ciclo, setCiclo] = React.useState<FiltroCiclo>("todos");
  const [ordem, setOrdem] = React.useState<Ordem>("recentes");
  const [comSandbox, setComSandbox] = React.useState(false);
  const [aberto, setAberto] = React.useState<AdminSubscriber | null>(null);

  const clientesQuery = useQuery({
    queryKey: ["admin", "clientes"],
    queryFn: () => carregar(),
  });

  const orfasQuery = useQuery({
    queryKey: ["admin", "clientes", "orfas"],
    queryFn: () => carregarOrfas(),
  });

  const todos = React.useMemo(() => clientesQuery.data ?? [], [clientesQuery.data]);
  const orfas = orfasQuery.data ?? [];

  /**
   * Base de todos os números da tela. Sandbox fica de fora por padrão: uma
   * assinatura de teste no valor cheio entra na receita como se fosse dinheiro,
   * e um único registro de homologação já distorce o MRR de um produto novo.
   */
  const base = React.useMemo(
    () => (comSandbox ? todos : todos.filter((c) => !c.devMode)),
    [todos, comSandbox],
  );
  const sandboxOcultos = todos.length - todos.filter((c) => !c.devMode).length;

  /**
   * Abrir em "Com acesso" é o certo no dia a dia, mas num produto que ainda não
   * tem assinante ativo isso entrega uma tela vazia — a pior primeira
   * impressão possível de um painel que, na verdade, tem dados.
   */
  const filtroEfetivo: Filtro = filtro ?? (base.some((c) => c.accessNow) ? "ativos" : "todos");

  /**
   * Recorte por ciclo aplicado ANTES do filtro de estado, para que a contagem
   * em cada chip diga quantos sobram dentro do ciclo escolhido. Chip que
   * continuasse contando sobre a base inteira prometeria linha que a lista não
   * vai mostrar.
   */
  const baseCiclo = React.useMemo(
    () => (ciclo === "todos" ? base : base.filter((c) => c.planCycle === ciclo)),
    [base, ciclo],
  );

  const visiveis = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const regra = FILTROS.find((f) => f.key === filtroEfetivo)?.conta ?? (() => true);
    return baseCiclo
      .filter((c) => {
        if (!regra(c)) return false;
        if (!termo) return true;
        return (
          (c.email ?? "").toLowerCase().includes(termo) ||
          (c.fullName ?? "").toLowerCase().includes(termo) ||
          (c.planName ?? "").toLowerCase().includes(termo) ||
          (c.trackName ?? "").toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => comparar(ordem, a, b));
  }, [baseCiclo, busca, filtroEfetivo, ordem]);

  const totais = React.useMemo(() => {
    const comAcesso = base.filter((c) => c.accessNow);
    const porCiclo = (cycle: string) => comAcesso.filter((c) => c.planCycle === cycle).length;
    const ativosSemUso = comAcesso.filter(emRisco).length;
    return {
      comAcesso: comAcesso.length,
      ativosSemUso,
      // Retenção medida no lado bom: quem tem acesso e deu sinal de uso.
      usandoPct: comAcesso.length
        ? Math.round(((comAcesso.length - ativosSemUso) / comAcesso.length) * 100)
        : 0,
      mensal: porCiclo("MONTHLY"),
      trimestral: porCiclo("QUARTERLY"),
      anual: porCiclo("YEARLY"),
      cartao: comAcesso.filter((c) => c.method === "CREDIT_CARD").length,
      pix: comAcesso.filter((c) => c.method === "PIX").length,
      // Soma dos equivalentes mensais: é o que permite somar mensal, trimestral
      // e anual num número só, sem fingir que um anual entra inteiro no mês.
      receitaMensal: comAcesso.reduce((a, c) => a + (c.monthlyEquivalentCents ?? 0), 0),
      // Caixa de verdade: cobranças confirmadas e não estornadas, de todo o
      // histórico — inclusive de quem já cancelou.
      recebido: base.reduce((a, c) => a + c.paidTotalCents, 0),
      // Dinheiro que entrou e voltou. Fica ao lado do recebido, não subtraído
      // dele: são dois fatos, e juntar os dois num líquido esconderia o volume
      // de devolução, que é o número que diz se a promessa de venda está
      // desalinhada do produto.
      devolvido: base.reduce((a, c) => a + c.refundedTotalCents, 0),
      // Pessoas distintas, não linhas: a lista é uma linha por ASSINATURA, e
      // quem assinou duas vezes e foi estornado nas duas contaria dobrado num
      // número que a tela chama de "clientes".
      reembolsados: new Set(base.filter((c) => c.refundedCount > 0).map((c) => c.userId)).size,
      chargebacks: new Set(base.filter((c) => c.chargebackCount > 0).map((c) => c.userId)).size,
    };
  }, [base]);

  if (clientesQuery.isPending) return <LoadingState />;
  if (clientesQuery.isError) {
    return (
      <ErrorState
        description="Não foi possível carregar os clientes."
        onRetry={() => void clientesQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Clientes"
        subtitle="Quem assina, em qual plano, há quanto tempo, quanto já pagou e o que anda usando."
      />

      {orfas.length ? <CobrancasOrfas pagamentos={orfas} /> : null}

      <div className="grid grid-cols-2 gap-px bg-divider lg:grid-cols-4">
        <Indicador
          label="Com acesso"
          valor={String(totais.comAcesso)}
          nota="assinatura valendo agora"
        />
        <Indicador
          label="Receita mensal equiv."
          valor={formatCents(totais.receitaMensal)}
          nota="ciclos normalizados por mês"
        />
        <Indicador
          label="Recebido no total"
          valor={formatCents(totais.recebido)}
          nota="cobranças pagas, sem estornos"
        />
        <Indicador
          label="Pagando e sem usar"
          valor={String(totais.ativosSemUso)}
          nota={`${totais.usandoPct}% dos ativos deram sinal de uso`}
          alerta={totais.ativosSemUso > 0}
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-caption text-neutral-600">
        <span>Mensal {totais.mensal}</span>
        <span>Trimestral {totais.trimestral}</span>
        <span>Anual {totais.anual}</span>
        <span aria-hidden className="text-divider">
          |
        </span>
        <span>Cartão {totais.cartao}</span>
        <span>PIX {totais.pix}</span>
        {totais.reembolsados > 0 ? (
          <>
            <span aria-hidden className="text-divider">
              |
            </span>
            <span className={totais.chargebacks > 0 ? "text-danger" : "text-warning"}>
              Devolvido {formatCents(totais.devolvido)} · {totais.reembolsados} cliente(s)
              {totais.chargebacks > 0 ? ` · ${totais.chargebacks} por chargeback` : ""}
            </span>
          </>
        ) : null}
      </p>

      <Blueprint className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-56 flex-1 flex-col gap-1">
            <span className="label-h6 text-neutral-700">Buscar</span>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="E-mail, nome, plano ou trilha"
              aria-label="Buscar cliente"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-h6 text-neutral-700">Ciclo</span>
            <Select value={ciclo} onValueChange={(v) => setCiclo(v as FiltroCiclo)}>
              <SelectTrigger className="w-[180px]" aria-label="Filtrar por ciclo de cobrança">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CICLOS.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-h6 text-neutral-700">Ordenar por</span>
            <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
              <SelectTrigger className="w-[220px]" aria-label="Ordenar clientes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDENS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {sandboxOcultos > 0 ? (
            <button
              type="button"
              onClick={() => setComSandbox((v) => !v)}
              aria-pressed={comSandbox}
              className={cn(
                "cursor-pointer border px-3 py-2 text-caption transition-colors",
                comSandbox
                  ? "border-accent-700 bg-accent-100 text-accent-800"
                  : "border-divider text-neutral-700 hover:bg-surface",
              )}
            >
              {comSandbox ? "Ocultar" : "Incluir"} {sandboxOcultos} de teste
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const n = baseCiclo.filter(f.conta).length;
            const ativo = filtroEfetivo === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltro(f.key)}
                aria-pressed={ativo}
                className={cn(
                  "flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-caption transition-colors",
                  ativo
                    ? "border-accent-700 bg-accent-100 text-accent-800"
                    : "border-divider text-neutral-700 hover:bg-surface",
                )}
              >
                <span>{f.label}</span>
                <span className={cn("num", ativo ? "text-accent-700" : "text-neutral-500")}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </Blueprint>

      {visiveis.length === 0 ? (
        <EmptyState
          title="Nenhum cliente com esses filtros"
          description="Ajuste a busca ou escolha outro filtro."
        />
      ) : (
        <ul className="flex flex-col gap-px bg-divider">
          {visiveis.map((c) => (
            <LinhaCliente key={c.id} c={c} onAbrir={() => setAberto(c)} />
          ))}
        </ul>
      )}

      <p className="text-caption text-neutral-600">
        &quot;Com acesso&quot; usa o mesmo critério do paywall: assinatura ativa (ou em retentativa)
        e período ainda não vencido. A receita mensal equivalente divide cada plano pelos meses do
        ciclo — é o único jeito de somar mensal, trimestral e anual no mesmo número, e não é caixa.
        &quot;Recebido no total&quot; é caixa: cobranças confirmadas no Asaas, sem as estornadas.
        &quot;Pagando e sem usar&quot; é quem tem acesso e passou {DIAS_PARA_RISCO} dias sem nenhum
        evento registrado — ou nunca usou depois de {CARENCIA_ATIVACAO} dias de assinatura. O uso
        vem de <span className="font-mono">usage_daily</span>, que é o mesmo dado guardado como
        prova de entrega numa contestação de cobrança.
      </p>

      <DetalheCliente cliente={aberto} onFechar={() => setAberto(null)} />
    </div>
  );
}

function Indicador({
  label,
  valor,
  nota,
  alerta,
}: {
  label: string;
  valor: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-bg p-4">
      <span className="label-h6 text-neutral-500">{label}</span>
      <span className={cn("num font-heading text-h3", alerta ? "text-danger" : "text-neutral-900")}>
        {valor}
      </span>
      {nota ? <span className="text-caption text-neutral-600">{nota}</span> : null}
    </div>
  );
}

/**
 * Cobranças que chegaram sem assinatura correlacionada.
 *
 * Fica ACIMA dos indicadores, e não numa aba escondida, porque cada linha aqui
 * é alguém que pagou e pode estar sem acesso — é o único item desta tela que
 * exige ação no mesmo dia, e tem prioridade sobre qualquer métrica.
 */
function CobrancasOrfas({ pagamentos }: { pagamentos: AdminPagamento[] }) {
  const emAberto = pagamentos.filter((p) => !p.estornado);

  return (
    <Blueprint className="border-danger p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="danger">atenção</Badge>
        <h2 className="font-heading text-h5 text-neutral-900">
          {pagamentos.length} cobrança(s) sem assinatura correlacionada
        </h2>
      </div>
      <p className="mt-1 text-caption text-neutral-700">
        O webhook recebeu o pagamento mas não achou a assinatura local, então o valor não entra no
        total de nenhum cliente
        {emAberto.length
          ? ` — e ${emAberto.length} delas não foram estornadas, ou seja, há alguém que pagou e pode estar sem acesso.`
          : " — todas já foram estornadas, então não há ninguém esperando acesso."}
      </p>
      <ul className="mt-3 flex flex-col gap-px bg-divider">
        {pagamentos.map((p) => (
          <li
            key={p.paymentId}
            className="flex flex-wrap items-center justify-between gap-2 bg-bg px-3 py-2"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="num text-body text-neutral-900">{formatCents(p.amountCents)}</span>
              {p.estornado ? <Badge variant="outline">estornado</Badge> : null}
              <span className="font-mono text-caption text-neutral-500">{p.paymentId}</span>
              {p.customerId ? (
                <span className="font-mono text-caption text-neutral-500">{p.customerId}</span>
              ) : null}
            </span>
            <span className="flex items-center gap-3">
              <span className="num font-mono text-caption text-neutral-500">{fmtData(p.at)}</span>
              {p.receiptUrl ? (
                <a
                  href={p.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-caption text-accent-700 underline-offset-2 hover:underline"
                >
                  recibo
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Blueprint>
  );
}

// ─── Linha da lista ───────────────────────────────────────────────────────────

function LinhaCliente({ c, onAbrir }: { c: AdminSubscriber; onAbrir: () => void }) {
  const cobrancaFalhou = c.status === "past_due";
  const risco = emRisco(c);
  const topo = c.usage.porEvento.slice(0, 2);

  return (
    <li className="bg-bg">
      <button
        type="button"
        onClick={onAbrir}
        className="grid w-full cursor-pointer grid-cols-1 gap-4 p-4 text-left transition-colors hover:bg-surface md:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto]"
        aria-label={`Abrir detalhes de ${c.fullName || c.email || "cliente"}`}
      >
        {/* Identidade e contrato */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-neutral-900">
              {c.fullName || c.email || "(sem nome)"}
            </span>
            {c.accessNow ? (
              <Badge className="bg-accent-700">com acesso</Badge>
            ) : (
              <Badge variant="outline">sem acesso</Badge>
            )}
            {cobrancaFalhou ? <Badge variant="danger">cobrança falhou</Badge> : null}
            {risco ? <Badge variant="warning">sem usar</Badge> : null}
            {c.cancelAtPeriodEnd && c.accessNow ? (
              <Badge variant="outline">cancelamento agendado</Badge>
            ) : null}
            {/* Chargeback e reembolso nunca viram o mesmo selo: um é
                atendimento, o outro é contestação no banco. */}
            {c.chargebackCount > 0 ? (
              <Badge variant="danger">
                chargeback{c.chargebackCount > 1 ? ` ${c.chargebackCount}×` : ""}
              </Badge>
            ) : c.refundedCount > 0 ? (
              <Badge variant="warning">
                reembolsado{c.refundedCount > 1 ? ` ${c.refundedCount}×` : ""}
              </Badge>
            ) : null}
            {c.devMode ? <Badge variant="outline">sandbox</Badge> : null}
            {c.isAdmin ? <Badge variant="outline">admin</Badge> : null}
          </div>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-caption text-neutral-600">
            {c.email ? <span className="truncate">{c.email}</span> : null}
            <span>{rotuloStatus(c.status)}</span>
            {c.trackName ? <span>{c.trackName}</span> : null}
            {c.seniority ? <span>{c.seniority}</span> : null}
          </p>

          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-caption text-neutral-600">
            <span>{c.planName ?? "(plano removido)"}</span>
            <span>{c.planCycle ? rotuloCiclo(c.planCycle) : "—"}</span>
            <span>{rotuloMetodo(c.method)}</span>
            {/* `firstActivatedAt` é quando pagou pela primeira vez. Quem só
                abriu o checkout aparece pelo `createdAt` e com outro rótulo —
                dizer "cliente há" para quem nunca pagou seria mentira. */}
            {c.firstActivatedAt ? (
              <span>cliente há {duracaoDesde(c.firstActivatedAt)}</span>
            ) : (
              <span>checkout aberto {haQuantoTempo(c.createdAt)}</span>
            )}
            {c.paidCycles > 0 ? (
              <span className="num">
                {c.paidCycles}× pago · {formatCents(c.paidTotalCents)}
              </span>
            ) : (
              <span>nunca pagou</span>
            )}
            {/* A data é a do ESTORNO, não a da cobrança estornada — quem lê
                precisa saber quando o dinheiro voltou. */}
            {c.refundedCount > 0 ? (
              <span className={cn("num", c.chargebackCount > 0 ? "text-danger" : "text-warning")}>
                −{formatCents(c.refundedTotalCents)} devolvido
                {c.lastRefundAt ? ` em ${fmtData(c.lastRefundAt)}` : ""}
              </span>
            ) : null}
          </p>
        </div>

        {/* Uso */}
        <div className="min-w-0">
          <div className={cn(risco ? "text-danger" : "text-accent-600")}>
            <Sparkline
              values={c.usage.serie}
              label={`Uso diário nos últimos ${c.usage.janelaDias} dias: ${c.usage.total} eventos`}
            />
          </div>
          <p className="mt-1 text-caption text-neutral-700">
            <span className="num">{c.usage.total}</span> eventos ·{" "}
            <span className="num">{c.usage.diasAtivos}</span> dias ativos
          </p>
          <p className={cn("text-caption", risco ? "text-danger" : "text-neutral-600")}>
            {textoDeUso(c)}
          </p>
          {topo.length ? (
            <p className="mt-0.5 truncate text-caption text-neutral-600">
              {topo.map((e) => `${rotuloEventoUso(e.event)} (${e.count})`).join(" · ")}
            </p>
          ) : null}
        </div>

        {/* Dinheiro */}
        <div className="shrink-0 text-left md:text-right">
          <div className="num font-heading text-h5 text-neutral-900">
            {formatCents(c.amountCents)}
          </div>
          {c.monthlyEquivalentCents !== null && c.planCycle !== "MONTHLY" ? (
            <div className="num text-caption text-neutral-600">
              {formatCents(c.monthlyEquivalentCents)}/mês
            </div>
          ) : null}
          <div className="mt-1 text-caption text-neutral-600">
            {/* Em quem cancelou, a data deixa de ser "próxima cobrança" e vira o
                fim do acesso — dizer "próxima cobrança" ali seria mentira, porque
                a recorrência já foi cancelada no gateway. */}
            {c.cancelAtPeriodEnd || !c.accessNow ? "acesso até " : "renova em "}
            {fmtData(c.currentPeriodEnd)}
          </div>
        </div>
      </button>
    </li>
  );
}

// ─── Dossiê ───────────────────────────────────────────────────────────────────

function DetalheCliente({
  cliente,
  onFechar,
}: {
  cliente: AdminSubscriber | null;
  onFechar: () => void;
}) {
  const carregar = useServerFn(getSubscriberDetail);
  const detalheQuery = useQuery({
    queryKey: ["admin", "cliente", cliente?.userId],
    queryFn: () => carregar({ data: { userId: cliente!.userId } }),
    // Só busca quando a gaveta abre: são ~15 consultas por cliente, e disparar
    // isso na montagem da lista custaria uma varredura do banco por linha.
    enabled: Boolean(cliente?.userId),
  });

  const d = detalheQuery.data;

  return (
    <Sheet open={Boolean(cliente)} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-h4">
            {cliente?.fullName || cliente?.email || "Cliente"}
          </SheetTitle>
        </SheetHeader>

        {detalheQuery.isPending ? (
          <LoadingState rows={8} label="Carregando o histórico do cliente…" />
        ) : detalheQuery.isError || !d ? (
          <ErrorState
            description="Não foi possível carregar o detalhe deste cliente."
            onRetry={() => void detalheQuery.refetch()}
          />
        ) : (
          <div className="flex flex-col gap-6 pb-8">
            <Identificacao d={d} c={cliente} />
            <UsoDetalhado usage={d.usage} eventos={d.ultimosEventos} />
            <ProdutoDetalhado d={d} />
            <Assinaturas d={d} />
            <ContaEConformidade d={d} />
            {d.bloqueios.length ? <Bloqueios d={d} /> : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="label-h6 text-neutral-500">{titulo}</h3>
      {children}
    </section>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-divider py-2">
      <span className="label-h6 text-neutral-500">{rotulo}</span>
      <span className="text-caption text-neutral-900">{valor}</span>
    </div>
  );
}

function Identificacao({ d, c }: { d: AdminSubscriberDetail; c: AdminSubscriber | null }) {
  return (
    <Secao titulo="Quem é">
      <div className="flex flex-wrap items-center gap-2">
        {d.isAdmin ? <Badge variant="outline">admin</Badge> : null}
        {d.isAnonymous ? <Badge variant="warning">conta anônima</Badge> : null}
        {d.isBanned ? <Badge variant="danger">desativado</Badge> : null}
        {d.emailConfirmed ? (
          <Badge variant="success">e-mail confirmado</Badge>
        ) : (
          <Badge variant="warning">e-mail não confirmado</Badge>
        )}
        {d.onboardingCompleted ? null : <Badge variant="warning">onboarding incompleto</Badge>}
      </div>

      {d.headline ? <p className="text-body text-neutral-800">{d.headline}</p> : null}

      <div className="grid grid-cols-2 gap-x-4 md:grid-cols-3">
        <Dado
          rotulo="E-mail"
          valor={<span className="font-mono break-all">{d.email ?? "—"}</span>}
        />
        <Dado rotulo="Trilha" valor={d.trackName ?? "não escolheu"} />
        <Dado rotulo="Senioridade" valor={d.seniority ?? "—"} />
        <Dado
          rotulo="Experiência"
          valor={d.yearsExperience !== null ? `${d.yearsExperience} anos` : "—"}
        />
        <Dado rotulo="Onde" valor={d.localidade ?? "—"} />
        <Dado
          rotulo="Cliente desde"
          valor={
            c?.firstActivatedAt
              ? `${fmtData(c.firstActivatedAt)} (${duracaoDesde(c.firstActivatedAt)})`
              : "ainda não pagou"
          }
        />
      </div>

      {c?.providerCustomerId ? (
        <a
          href={`https://www.asaas.com/customerAccount/show/${c.providerCustomerId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 border border-divider px-3 py-1.5 text-caption text-neutral-800 hover:bg-surface"
        >
          Abrir no Asaas
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </Secao>
  );
}

function UsoDetalhado({
  usage,
  eventos,
}: {
  usage: AdminUsageSummary;
  eventos: AdminSubscriberDetail["ultimosEventos"];
}) {
  const maior = usage.porEvento[0]?.count ?? 1;

  return (
    <Secao titulo={`Uso — últimos ${usage.janelaDias} dias`}>
      <div className="grid grid-cols-3 gap-px bg-divider">
        <Indicador label="Eventos" valor={String(usage.total)} />
        <Indicador label="Dias ativos" valor={`${usage.diasAtivos}/${usage.janelaDias}`} />
        <Indicador
          label="Último uso"
          valor={usage.ultimoDia ? haQuantoTempo(diaParaData(usage.ultimoDia).toISOString()) : "—"}
        />
      </div>

      <div className="text-accent-600">
        <Sparkline
          values={usage.serie}
          height={48}
          label={`Uso diário nos últimos ${usage.janelaDias} dias: ${usage.total} eventos`}
        />
      </div>

      {usage.porEvento.length === 0 ? (
        <p className="text-caption text-neutral-600">
          Nenhum evento registrado na janela. Ou não abriu o produto, ou só entrou e saiu.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {usage.porEvento.map((e) => (
            <li key={e.event} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="truncate text-caption text-neutral-800">
                  {rotuloEventoUso(e.event)}
                </div>
                <div
                  className="mt-0.5 h-1.5 bg-accent-600"
                  style={{ width: `${Math.max(4, (e.count / maior) * 100)}%` }}
                  aria-hidden
                />
              </div>
              <span className="num text-caption text-neutral-700">{e.count}</span>
            </li>
          ))}
        </ul>
      )}

      {eventos.length ? (
        <details className="border border-divider">
          <summary className="cursor-pointer px-3 py-2 text-caption text-neutral-700 hover:bg-surface">
            Últimos {eventos.length} eventos, um a um
          </summary>
          <ul className="flex flex-col gap-px bg-divider">
            {eventos.map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 bg-bg px-3 py-1.5"
              >
                <span className="text-caption text-neutral-800">{rotuloEventoUso(e.event)}</span>
                <span className="num font-mono text-caption text-neutral-500">
                  {fmtDataHora(e.at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Secao>
  );
}

function ProdutoDetalhado({ d }: { d: AdminSubscriberDetail }) {
  const p = d.produto;
  return (
    <Secao titulo="O que construiu no produto">
      <div className="grid grid-cols-2 gap-x-4 md:grid-cols-3">
        <Dado
          rotulo="Currículos enviados"
          valor={
            p.cvs === 0
              ? "nenhum"
              : `${p.cvs} · último ${haQuantoTempo(p.ultimoCvAt)}${
                  p.ultimoCvStatus && p.ultimoCvStatus !== "parsed" ? ` (${p.ultimoCvStatus})` : ""
                }`
          }
        />
        <Dado
          rotulo="Análises de aderência"
          valor={
            p.analises === 0
              ? "nenhuma"
              : `${p.analises} · última ${haQuantoTempo(p.ultimaAnaliseAt)}`
          }
        />
        <Dado
          rotulo="Último score"
          valor={
            p.ultimoScore === null ? "—" : <span className="num">{Math.round(p.ultimoScore)}%</span>
          }
        />
        <Dado rotulo="Skills no perfil" valor={<span className="num">{p.skills}</span>} />
        <Dado
          rotulo="Plano de estudos"
          valor={
            p.planosEstudo === 0
              ? "não montou"
              : `${p.planosEstudo} plano(s) · ${p.itensConcluidos}/${p.itensEstudo} itens`
          }
        />
        <Dado
          rotulo="Horas registradas"
          valor={<span className="num">{p.horasRegistradas}h</span>}
        />
        <Dado rotulo="Certificações" valor={<span className="num">{p.certificacoes}</span>} />
        <Dado rotulo="Cursos" valor={<span className="num">{p.cursos}</span>} />
        <Dado
          rotulo="Empresas seguidas"
          valor={<span className="num">{p.empresasSeguidas}</span>}
        />
      </div>
    </Secao>
  );
}

function Assinaturas({ d }: { d: AdminSubscriberDetail }) {
  return (
    <Secao titulo={`Assinaturas (${d.subscriptions.length})`}>
      {d.subscriptions.length === 0 ? (
        <p className="text-caption text-neutral-600">Nunca abriu um checkout.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {d.subscriptions.map((s) => {
            const pagas = s.pagamentos.filter((p) => !p.estornado);
            const recebido = pagas.reduce((a, p) => a + p.amountCents, 0);
            return (
              <li key={s.id} className="border border-divider p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-semibold text-neutral-900">
                    {s.planName ?? "(plano removido)"}
                  </span>
                  <Badge variant="neutral">{rotuloStatus(s.status)}</Badge>
                  {s.planCycle ? <Badge variant="outline">{rotuloCiclo(s.planCycle)}</Badge> : null}
                  <Badge variant="outline">{rotuloMetodo(s.method)}</Badge>
                  {s.devMode ? <Badge variant="outline">sandbox</Badge> : null}
                  {s.cancelAtPeriodEnd ? (
                    <Badge variant="warning">cancelamento agendado</Badge>
                  ) : null}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-4 md:grid-cols-3">
                  <Dado rotulo="Checkout aberto" valor={fmtData(s.createdAt)} />
                  <Dado rotulo="Primeira ativação" valor={fmtData(s.firstActivatedAt)} />
                  <Dado
                    rotulo="Período vigente"
                    valor={`${fmtData(s.currentPeriodStart)} → ${fmtData(s.currentPeriodEnd)}`}
                  />
                  <Dado rotulo="Valor do ciclo" valor={formatCents(s.amountCents)} />
                  <Dado
                    rotulo="Recebido"
                    valor={
                      <span className="num">
                        {pagas.length}× · {formatCents(recebido)}
                      </span>
                    }
                  />
                  <Dado
                    rotulo="Cancelamento"
                    valor={
                      s.cancelledAt
                        ? `${fmtData(s.cancelledAt)}${s.cancelledDueTo ? ` — ${s.cancelledDueTo}` : ""}`
                        : "—"
                    }
                  />
                </div>

                {s.pagamentos.length ? (
                  <ul className="mt-2 flex flex-col gap-px bg-divider">
                    {s.pagamentos.map((p) => (
                      <li
                        key={p.paymentId}
                        className="flex flex-wrap items-center justify-between gap-2 bg-bg px-2 py-1.5"
                      >
                        <span className="flex items-center gap-2 text-caption text-neutral-800">
                          <span className="num">{formatCents(p.amountCents)}</span>
                          {/* Mesmo vocabulário da lista: a linha do cliente diz
                              "chargeback" e o dossiê não pode chamar a MESMA
                              cobrança de "estornado". */}
                          {p.estornoTipo === "chargeback" ? (
                            <Badge variant="danger">chargeback</Badge>
                          ) : p.estornado ? (
                            <Badge variant="warning">reembolsado</Badge>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="num font-mono text-caption text-neutral-500">
                            {fmtData(p.at)}
                          </span>
                          {/* Duas datas quando houve estorno: quando entrou e
                              quando voltou. Só `p.at` daria a entender que o
                              dinheiro voltou no dia em que foi cobrado. */}
                          {p.estornoAt ? (
                            <span className="num font-mono text-caption text-warning">
                              ↩ {fmtData(p.estornoAt)}
                            </span>
                          ) : null}
                          {p.receiptUrl ? (
                            <a
                              href={p.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-caption text-accent-700 underline-offset-2 hover:underline"
                            >
                              recibo
                              <ExternalLink className="size-3" aria-hidden />
                            </a>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-caption text-neutral-600">
                    Nenhuma cobrança confirmada nesta assinatura.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

function ContaEConformidade({ d }: { d: AdminSubscriberDetail }) {
  return (
    <Secao titulo="Conta e conformidade">
      <div className="grid grid-cols-2 gap-x-4 md:grid-cols-3">
        <Dado
          rotulo="Conta criada"
          valor={`${fmtData(d.accountCreatedAt)} (${duracaoDesde(d.accountCreatedAt)})`}
        />
        <Dado
          rotulo="Último login"
          valor={d.lastSignInAt ? `${fmtDataHora(d.lastSignInAt)}` : "nunca entrou"}
        />
        <Dado rotulo="Onboarding" valor={d.onboardingCompleted ? "concluído" : "pendente"} />
        <Dado rotulo="Tour" valor={d.tourStatus ?? "—"} />
        <Dado
          rotulo="Termos aceitos"
          valor={
            d.termosVersao ? `${d.termosVersao} em ${fmtData(d.termosAceitosAt)}` : "não aceitou"
          }
        />
        <Dado
          rotulo="ID do usuário"
          valor={<span className="font-mono break-all">{d.userId}</span>}
        />
      </div>
    </Secao>
  );
}

function Bloqueios({ d }: { d: AdminSubscriberDetail }) {
  return (
    <Secao titulo="Bloqueios de reassinatura">
      <ul className="flex flex-col gap-px bg-divider">
        {d.bloqueios.map((b) => (
          <li key={b.id} className="bg-bg p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={b.releasedAt ? "outline" : "danger"}>
                {b.releasedAt ? "liberado" : "em aberto"}
              </Badge>
              <span className="text-caption text-neutral-800">{b.reason}</span>
            </div>
            <p className="mt-1 font-mono text-caption text-neutral-500">
              {fmtData(b.createdAt)}
              {b.releasedAt ? ` → liberado em ${fmtData(b.releasedAt)}` : ""}
              {b.releasedNote ? ` · ${b.releasedNote}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </Secao>
  );
}
