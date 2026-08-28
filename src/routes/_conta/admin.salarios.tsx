import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState, LoadingState, ErrorState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMarket, SENIORITY_LABEL, SEGMENT_LABEL, type MarketSegment } from "@/hooks/use-market";
import {
  listSalaryObservations,
  reviewSalaryObservation,
  updateSalaryObservation,
  deleteSalaryObservation,
  refreshSalaryStats,
  type AdminSalaryRow,
} from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_conta/admin/salarios")({
  component: AdminSalariosPage,
});

type StatusFiltro = "pendente" | "aprovada" | "rejeitada" | "todos";

const STATUS: Array<{ key: StatusFiltro; label: string }> = [
  { key: "pendente", label: "Pendentes" },
  { key: "aprovada", label: "Aprovadas" },
  { key: "rejeitada", label: "Rejeitadas" },
  { key: "todos", label: "Todas" },
];

const PERIODO_LABEL: Record<string, string> = { hour: "/h", month: "/mês", year: "/ano" };

function dinheiro(v: number | null, moeda: string) {
  if (v === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda,
    maximumFractionDigits: 0,
  }).format(v);
}

function faixa(r: AdminSalaryRow) {
  const p = PERIODO_LABEL[r.period] ?? "";
  if (r.amountMin !== null && r.amountMax !== null && r.amountMin !== r.amountMax) {
    return `${dinheiro(r.amountMin, r.currency)}–${dinheiro(r.amountMax, r.currency)} ${p}`;
  }
  return `${dinheiro(r.amountMin ?? r.amountMax, r.currency)} ${p}`;
}

function AdminSalariosPage() {
  const qc = useQueryClient();
  const market = useMarket();
  const carregar = useServerFn(listSalaryObservations);
  const revisar = useServerFn(reviewSalaryObservation);
  const corrigir = useServerFn(updateSalaryObservation);
  const excluir = useServerFn(deleteSalaryObservation);
  const recalcular = useServerFn(refreshSalaryStats);

  const [status, setStatus] = React.useState<StatusFiltro>("pendente");
  const [soDiscrepantes, setSoDiscrepantes] = React.useState(false);
  const [editando, setEditando] = React.useState<AdminSalaryRow | null>(null);

  const lista = useQuery({
    queryKey: ["admin", "salarios", status, soDiscrepantes],
    queryFn: () =>
      carregar({
        data: {
          status,
          onlyOutliers: soDiscrepantes,
          source: "todos",
          marketSegment: "todos",
          limit: 200,
        },
      }),
  });

  const invalidar = () => void qc.invalidateQueries({ queryKey: ["admin", "salarios"] });

  const revisarMut = useMutation({
    mutationFn: (v: { id: string; status: "aprovada" | "rejeitada" }) => revisar({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.status === "aprovada" ? "Contribuição aprovada." : "Contribuição rejeitada.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirMut = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => {
      toast.success("Registro excluído.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recalcularMut = useMutation({
    mutationFn: () => recalcular({ data: {} }),
    onSuccess: () => toast.success("Estatísticas recalculadas."),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = lista.data ?? [];
  const pendentes = rows.filter((r) => r.status === "pendente").length;

  if (lista.isPending) return <LoadingState />;
  if (lista.isError) {
    return (
      <ErrorState
        description="Não foi possível carregar as contribuições."
        onRetry={() => void lista.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Salários"
        subtitle="Contribuições de usuários entram como pendentes e só afetam a mediana depois de aprovadas."
      />

      <Blueprint className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {STATUS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus(s.key)}
              aria-pressed={status === s.key}
              className={cn(
                "cursor-pointer border px-3 py-1.5 text-caption transition-colors",
                status === s.key
                  ? "border-accent-700 bg-accent-100 text-accent-800"
                  : "border-divider text-neutral-700 hover:bg-surface",
              )}
            >
              {s.label}
              {s.key === "pendente" && pendentes > 0 && status === "pendente"
                ? ` (${pendentes})`
                : ""}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSoDiscrepantes(!soDiscrepantes)}
          aria-pressed={soDiscrepantes}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 border px-3 py-1.5 text-caption transition-colors",
            soDiscrepantes
              ? "border-warning bg-warning/10 text-warning"
              : "border-divider text-neutral-700 hover:bg-surface",
          )}
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          Só discrepantes
        </button>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          loading={recalcularMut.isPending}
          onClick={() => recalcularMut.mutate()}
        >
          <RefreshCw className="size-4" aria-hidden />
          Recalcular estatísticas
        </Button>
      </Blueprint>

      {rows.length === 0 ? (
        <EmptyState
          title={status === "pendente" ? "Nada para revisar" : "Nenhum registro"}
          description={
            status === "pendente"
              ? "Não há contribuições aguardando aprovação."
              : "Ajuste os filtros para ver outros registros."
          }
        />
      ) : (
        <ul className="flex flex-col gap-px bg-divider">
          {rows.map((r) => (
            <Linha
              key={r.id}
              r={r}
              ocupado={revisarMut.isPending || excluirMut.isPending}
              onAprovar={() => revisarMut.mutate({ id: r.id, status: "aprovada" })}
              onRejeitar={() => revisarMut.mutate({ id: r.id, status: "rejeitada" })}
              onEditar={() => setEditando(r)}
              onExcluir={() => excluirMut.mutate(r.id)}
            />
          ))}
        </ul>
      )}

      <p className="text-caption text-neutral-600">
        Observações vindas de vaga já entram aprovadas — têm origem rastreável. Só contribuição de
        usuário passa por aqui. Aprovar não recalcula a mediana na hora: use{" "}
        <strong>Recalcular estatísticas</strong> ao terminar a revisão.
      </p>

      <DialogEdicao
        row={editando}
        tracks={market.tracks}
        onFechar={() => setEditando(null)}
        onSalvar={async (payload) => {
          try {
            await corrigir({ data: payload });
            toast.success("Valores corrigidos.");
            setEditando(null);
            invalidar();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function Linha({
  r,
  ocupado,
  onAprovar,
  onRejeitar,
  onEditar,
  onExcluir,
}: {
  r: AdminSalaryRow;
  ocupado: boolean;
  onAprovar: () => void;
  onRejeitar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const discrepante =
    r.desvio !== null && r.amostraDoBalde >= 3 && (r.desvio > 2.5 || r.desvio < 0.4);

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 bg-bg p-4",
        discrepante && "border-l-2 border-warning",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num text-body font-semibold text-neutral-900">{faixa(r)}</span>
          <Badge variant={r.source === "user" ? "outline" : "neutral"}>
            {r.source === "user" ? "usuário" : "vaga"}
          </Badge>
          {r.status === "pendente" ? <Badge variant="warning">pendente</Badge> : null}
          {r.status === "rejeitada" ? <Badge variant="danger">rejeitada</Badge> : null}
          {discrepante ? (
            <Badge variant="warning">
              {r.desvio && r.desvio > 1 ? `${r.desvio}× a mediana` : `${r.desvio}× da mediana`}
            </Badge>
          ) : null}
        </div>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-caption text-neutral-600">
          <span>{r.trackName ?? "sem trilha"}</span>
          <span>
            {r.seniority
              ? (SENIORITY_LABEL[r.seniority as never] ?? r.seniority)
              : "sem senioridade"}
          </span>
          <span>{SEGMENT_LABEL[r.marketSegment as MarketSegment] ?? r.marketSegment}</span>
          {r.medianaDoBalde !== null ? (
            <span>
              mediana do grupo {dinheiro(Math.round(r.medianaDoBalde), r.currency)}/mês · n=
              {r.amostraDoBalde}
            </span>
          ) : (
            <span>sem base de comparação</span>
          )}
        </p>

        {r.origem ? (
          <p className="mt-1 truncate text-caption text-neutral-600">{r.origem}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {r.status !== "aprovada" ? (
          <Button variant="outline" size="sm" disabled={ocupado} onClick={onAprovar}>
            <Check className="size-4" aria-hidden />
            Aprovar
          </Button>
        ) : null}
        {r.status !== "rejeitada" ? (
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={onRejeitar}>
            <X className="size-4" aria-hidden />
            Rejeitar
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={ocupado}
          onClick={onEditar}
          aria-label="Corrigir valores"
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={ocupado}
          onClick={onExcluir}
          aria-label="Excluir"
        >
          <Trash2 className="size-4 text-danger" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function DialogEdicao({
  row,
  tracks,
  onFechar,
  onSalvar,
}: {
  row: AdminSalaryRow | null;
  tracks: Array<{ id: string; name: string }>;
  onFechar: () => void;
  onSalvar: (p: {
    id: string;
    amountMin: number | null;
    amountMax: number | null;
    currency: "BRL" | "USD" | "EUR";
    period: "hour" | "month" | "year";
    seniority: "junior" | "pleno" | "senior" | "staff" | null;
    marketSegment: "br" | "remoto_global";
    trackId: string | null;
  }) => void;
}) {
  const [min, setMin] = React.useState("");
  const [max, setMax] = React.useState("");
  const [moeda, setMoeda] = React.useState("BRL");
  const [periodo, setPeriodo] = React.useState("month");
  const [sen, setSen] = React.useState("");
  const [seg, setSeg] = React.useState("br");
  const [trilha, setTrilha] = React.useState("");

  React.useEffect(() => {
    if (!row) return;
    setMin(row.amountMin !== null ? String(row.amountMin) : "");
    setMax(row.amountMax !== null ? String(row.amountMax) : "");
    setMoeda(row.currency);
    setPeriodo(row.period);
    setSen(row.seniority ?? "");
    setSeg(row.marketSegment === "remoto_global" ? "remoto_global" : "br");
    setTrilha(row.trackId ?? "");
  }, [row]);

  if (!row) return null;

  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corrigir valores</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="label-h6 text-neutral-700">Mínimo</span>
            <Input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-h6 text-neutral-700">Máximo</span>
            <Input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-h6 text-neutral-700">Moeda</span>
            <select className="field" value={moeda} onChange={(e) => setMoeda(e.target.value)}>
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-h6 text-neutral-700">Período</span>
            <select className="field" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              <option value="month">Mensal</option>
              <option value="year">Anual</option>
              <option value="hour">Por hora</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-h6 text-neutral-700">Senioridade</span>
            <select className="field" value={sen} onChange={(e) => setSen(e.target.value)}>
              <option value="">Não informada</option>
              <option value="junior">Júnior</option>
              <option value="pleno">Pleno</option>
              <option value="senior">Sênior</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-h6 text-neutral-700">Segmento</span>
            <select className="field" value={seg} onChange={(e) => setSeg(e.target.value)}>
              <option value="br">Brasil (BRL)</option>
              <option value="remoto_global">Remoto global (USD)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="label-h6 text-neutral-700">Trilha</span>
            <select className="field" value={trilha} onChange={(e) => setTrilha(e.target.value)}>
              <option value="">Sem trilha</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-caption text-neutral-600">
          Corrigir não aprova. Depois de ajustar, use <strong>Aprovar</strong> na lista.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onSalvar({
                id: row.id,
                amountMin: min.trim() ? Number(min) : null,
                amountMax: max.trim() ? Number(max) : null,
                currency: moeda as "BRL" | "USD" | "EUR",
                period: periodo as "hour" | "month" | "year",
                seniority: (sen || null) as "junior" | "pleno" | "senior" | "staff" | null,
                marketSegment: seg as "br" | "remoto_global",
                trackId: trilha || null,
              })
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
