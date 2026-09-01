import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  List,
  Columns,
  Clock,
  Trash2,
  ChevronDown,
  ChevronRight,
  Zap,
  CalendarDays,
  CheckCircle2,
  Circle,
  PlayCircle,
} from "lucide-react";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState, LoadingState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useMarket, SENIORITY_LABEL } from "@/hooks/use-market";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getStudyPlans,
  createStudyPlan,
  getStudyItems,
  createStudyItem,
  updateStudyItem,
  deleteStudyItem,
  addStudyLog,
  getStudyHeatmap,
  generatePlanFromGap,
  type StudyPlan,
  type StudyItem,
  type ItemStatus,
  type ItemType,
} from "@/lib/study.functions";

export const Route = createFileRoute("/_conta/progresso")({
  head: () => ({
    meta: [
      { title: "Progresso — RUMVIA" },
      {
        name: "description",
        content: "Kanban de estudo, registro de horas e plano gerado das suas lacunas.",
      },
    ],
  }),
  component: ProgressoPage,
});

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  curso: "Curso",
  certificacao: "Certificação",
  projeto: "Projeto",
  leitura: "Leitura",
  lab: "Lab",
  outro: "Outro",
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  backlog: "Backlog",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

const COLUMNS: ItemStatus[] = ["backlog", "em_andamento", "concluido"];

const STATUS_ICON: Record<ItemStatus, React.ReactNode> = {
  backlog: <Circle size={13} />,
  em_andamento: <PlayCircle size={13} style={{ color: "var(--color-warning)" }} />,
  concluido: <CheckCircle2 size={13} style={{ color: "var(--color-success)" }} />,
};

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function buildHeatmapGrid(rows: { date: string; hours: number }[]) {
  const map = new Map(rows.map((r) => [r.date, r.hours]));
  const today = new Date();
  const cells: { date: string; hours: number }[] = [];
  for (let i = 179; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, hours: map.get(key) ?? 0 });
  }
  return cells;
}

function Heatmap({ rows }: { rows: { date: string; hours: number }[] }) {
  const cells = buildHeatmapGrid(rows);
  const streak = (() => {
    let s = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (let i = cells.length - 1; i >= 0; i--) {
      const cell = cells[i];
      if (!cell) break;
      if (cell.date > today) continue;
      if (cell.hours > 0) s++;
      else break;
    }
    return s;
  })();

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-3 text-xs mb-1"
        style={{ color: "var(--color-muted-foreground, #888)" }}
      >
        <span>Últimos 6 meses</span>
        {streak > 0 && (
          <span className="font-semibold" style={{ color: "var(--color-success)" }}>
            🔥 {streak} dia{streak !== 1 ? "s" : ""} consecutivo{streak !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "repeat(7, 10px)",
          gridAutoFlow: "column",
          gap: 2,
          overflowX: "auto",
        }}
      >
        {cells.map((c) => (
          <div
            key={c.date}
            title={`${c.date}: ${c.hours}h`}
            style={{
              width: 10,
              height: 10,
              background:
                c.hours === 0
                  ? "var(--color-border, #e5e7eb)"
                  : c.hours < 1
                    ? "#7e9cb8"
                    : c.hours < 3
                      ? "#416180"
                      : "#1e3a52",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onStatusChange,
  onDelete,
  onLogHours,
}: {
  item: StudyItem;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onDelete: (id: string) => void;
  onLogHours: (item: StudyItem) => void;
}) {
  const [dragging, setDragging] = React.useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("itemId", item.id);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className="border p-3 flex flex-col gap-2 cursor-grab"
      style={{
        opacity: dragging ? 0.5 : 1,
        background: "var(--color-card, var(--background))",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{item.title}</span>
        <button
          onClick={() => onDelete(item.id)}
          className="shrink-0 opacity-40 hover:opacity-100"
          title="Excluir"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-xs px-1.5 py-0.5 border"
          style={{ color: "var(--color-muted-foreground, #888)" }}
        >
          {ITEM_TYPE_LABEL[item.type]}
        </span>
        {item.dueDate && (
          <span
            className="text-xs flex items-center gap-1"
            style={{ color: "var(--color-muted-foreground, #888)" }}
          >
            <CalendarDays size={10} />
            {item.dueDate}
          </span>
        )}
        {item.estimatedHours && (
          <span
            className="text-xs flex items-center gap-1"
            style={{ color: "var(--color-muted-foreground, #888)" }}
          >
            <Clock size={10} />
            {item.spentHours}/{item.estimatedHours}h
          </span>
        )}
      </div>
      {item.progressPercent > 0 && (
        <div className="w-full h-1 bg-gray-200" style={{ background: "var(--color-border)" }}>
          <div
            style={{
              width: `${item.progressPercent}%`,
              height: "100%",
              background: "var(--color-accent-600, #416180)",
            }}
          />
        </div>
      )}
      <div className="flex items-center gap-2 mt-1">
        <Select value={item.status} onValueChange={(v) => onStatusChange(item.id, v as ItemStatus)}>
          <SelectTrigger className="h-6 text-xs w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLUMNS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => onLogHours(item)}
          className="text-xs flex items-center gap-1 opacity-60 hover:opacity-100"
        >
          <Clock size={10} /> Registrar horas
        </button>
      </div>
      {item.resourceUrl && (
        <a
          href={item.resourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs truncate"
          style={{ color: "var(--color-accent-600, #416180)" }}
        >
          {item.resourceUrl}
        </a>
      )}
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  items,
  onDrop,
  onStatusChange,
  onDelete,
  onLogHours,
}: {
  status: ItemStatus;
  items: StudyItem[];
  onDrop: (itemId: string, newStatus: ItemStatus) => void;
  onStatusChange: (id: string, status: ItemStatus) => void;
  onDelete: (id: string) => void;
  onLogHours: (item: StudyItem) => void;
}) {
  const [over, setOver] = React.useState(false);

  return (
    <div
      className="flex flex-col gap-2 min-h-32 p-2 border"
      style={{
        background: over ? "var(--color-muted, rgba(0,0,0,0.04))" : "transparent",
        flex: 1,
        minWidth: 220,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("itemId");
        if (id) onDrop(id, status);
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {STATUS_ICON[status]}
        <span className="text-xs font-semibold uppercase tracking-wider">
          {STATUS_LABEL[status]}
        </span>
        <span className="ml-auto text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
          {items.length}
        </span>
      </div>
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onLogHours={onLogHours}
        />
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ProgressoPage() {
  const { trackId, seniority, segment, periodDays } = useMarket();
  const { isAnonymous } = useAuth();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = React.useState<"kanban" | "lista">("kanban");
  const [selectedPlanId, setSelectedPlanId] = React.useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = React.useState(false);
  const [showNewPlan, setShowNewPlan] = React.useState(false);
  const [newPlanTitle, setNewPlanTitle] = React.useState("");
  const [showNewItem, setShowNewItem] = React.useState(false);
  const [newItemTitle, setNewItemTitle] = React.useState("");
  const [newItemType, setNewItemType] = React.useState<ItemType>("outro");
  const [newItemUrl, setNewItemUrl] = React.useState("");
  const [newItemHours, setNewItemHours] = React.useState("");
  const [logTarget, setLogTarget] = React.useState<StudyItem | null>(null);
  const [logHours, setLogHours] = React.useState("1");
  const [filterType, setFilterType] = React.useState<ItemType | "todos">("todos");
  const [filterStatus, setFilterStatus] = React.useState<ItemStatus | "todos">("todos");

  // Server functions
  const getPlansRun = useServerFn(getStudyPlans);
  const createPlanRun = useServerFn(createStudyPlan);
  const getItemsRun = useServerFn(getStudyItems);
  const createItemRun = useServerFn(createStudyItem);
  const updateItemRun = useServerFn(updateStudyItem);
  const deleteItemRun = useServerFn(deleteStudyItem);
  const addLogRun = useServerFn(addStudyLog);
  const getHeatmapRun = useServerFn(getStudyHeatmap);
  const generatePlanRun = useServerFn(generatePlanFromGap);

  const plansQuery = useQuery({
    queryKey: ["study_plans"],
    enabled: !isAnonymous,
    queryFn: () => getPlansRun({ data: {} }),
  });

  const plans = plansQuery.data ?? [];
  const activePlanId =
    selectedPlanId ?? plans.find((p) => p.status === "ativo")?.id ?? plans[0]?.id ?? null;

  const itemsQuery = useQuery({
    queryKey: ["study_items", activePlanId],
    enabled: !!activePlanId,
    queryFn: () => getItemsRun({ data: { planId: activePlanId! } }),
  });

  const heatmapQuery = useQuery({
    queryKey: ["study_heatmap"],
    enabled: !isAnonymous,
    queryFn: () => getHeatmapRun({ data: {} }),
  });

  const invalidateItems = () => qc.invalidateQueries({ queryKey: ["study_items", activePlanId] });

  const createPlanMutation = useMutation({
    mutationFn: () =>
      createPlanRun({
        data: {
          title: newPlanTitle,
          ...(trackId ? { trackId } : {}),
        },
      }),
    onSuccess: (plan) => {
      qc.invalidateQueries({ queryKey: ["study_plans"] });
      setSelectedPlanId(plan.id);
      setNewPlanTitle("");
      setShowNewPlan(false);
      toast.success("Plano criado!");
    },
  });

  const gapPlan = plans.find((p) => p.source === "gap_generated" && p.trackId === trackId);

  const generateMutation = useMutation({
    mutationFn: (mode: "criar" | "refazer" | "adicionar_novas") =>
      generatePlanRun({
        data: { trackId: trackId!, seniority, marketSegment: segment, periodDays, mode },
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["study_plans"] });
      qc.invalidateQueries({ queryKey: ["study_items", result.plan.id] });
      setSelectedPlanId(result.plan.id);
      setShowRegenerateDialog(false);
      if (result.isFirstPlan) {
        toast.success("Este é o seu primeiro plano — gerado com suas 10 maiores lacunas!");
      } else if (result.mode === "refazer") {
        toast.success(`Plano refeito do zero com ${result.addedCount} lacuna(s) atuais.`);
      } else if (result.addedCount > 0) {
        toast.success(`${result.addedCount} novidade(s) adicionada(s) ao plano.`);
      } else {
        toast.info("Não há mudanças — seu plano já cobre as lacunas atuais.");
      }
    },
    onError: () => toast.error("Análise de gap não encontrada. Acesse o Dashboard primeiro."),
  });

  function handleGerarClick() {
    if (gapPlan) {
      setShowRegenerateDialog(true);
      return;
    }
    generateMutation.mutate("criar");
  }

  const createItemMutation = useMutation({
    mutationFn: () =>
      createItemRun({
        data: {
          planId: activePlanId!,
          title: newItemTitle,
          type: newItemType,
          ...(newItemUrl ? { resourceUrl: newItemUrl } : {}),
          ...(newItemHours ? { estimatedHours: Number(newItemHours) } : {}),
        },
      }),
    onSuccess: () => {
      invalidateItems();
      setNewItemTitle("");
      setNewItemUrl("");
      setNewItemHours("");
      setShowNewItem(false);
      toast.success("Item adicionado!");
    },
  });

  const moveItemMutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: ItemStatus }) => {
      const now = status === "concluido" ? new Date().toISOString() : null;
      return updateItemRun({
        data: {
          itemId,
          status,
          ...(status === "concluido" ? { completedAt: now! } : { completedAt: null }),
        },
      });
    },
    onSuccess: () => invalidateItems(),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteItemRun({ data: { itemId } }),
    onSuccess: () => {
      invalidateItems();
      toast.success("Item removido.");
    },
  });

  const logMutation = useMutation({
    mutationFn: () =>
      addLogRun({
        data: {
          itemId: logTarget!.id,
          hours: Number(logHours),
        },
      }),
    onSuccess: () => {
      // Also update spent_hours on the item
      updateItemRun({
        data: {
          itemId: logTarget!.id,
          spentHours: logTarget!.spentHours + Number(logHours),
        },
      });
      invalidateItems();
      qc.invalidateQueries({ queryKey: ["study_heatmap"] });
      setLogTarget(null);
      setLogHours("1");
      toast.success("Horas registradas!");
    },
  });

  const items = itemsQuery.data ?? [];
  const filteredItems = items.filter((i) => {
    if (filterType !== "todos" && i.type !== filterType) return false;
    if (filterStatus !== "todos" && i.status !== filterStatus) return false;
    return true;
  });

  const itemsByStatus = (status: ItemStatus) => filteredItems.filter((i) => i.status === status);

  // Impact calculation: count concluded items
  const concludedCount = items.filter((i) => i.status === "concluido").length;
  const totalHours = items.reduce((sum, i) => sum + i.spentHours, 0);

  if (isAnonymous) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Aprendizado" title="Progresso" />
        <EmptyState
          title="Conta permanente necessária"
          description="Crie uma conta para usar o plano de estudos e registrar seu progresso."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Aprendizado"
        title="Progresso"
        subtitle="Kanban de estudo, heatmap de consistência e plano gerado das suas lacunas."
      />

      {/* Heatmap + stats */}
      <Blueprint>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            {heatmapQuery.isLoading && <LoadingState />}
            {heatmapQuery.isSuccess && <Heatmap rows={heatmapQuery.data ?? []} />}
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col">
              <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                Itens concluídos
              </span>
              <span className="text-2xl font-semibold">{concludedCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                Horas estudadas
              </span>
              <span className="text-2xl font-semibold">{totalHours.toFixed(1)}h</span>
            </div>
          </div>
        </div>
      </Blueprint>

      {/* Plan selector + actions */}
      <div className="flex flex-wrap items-center gap-3">
        {plans.length > 0 && (
          <Select value={activePlanId ?? ""} onValueChange={(v) => setSelectedPlanId(v)}>
            <SelectTrigger className="w-64 h-8 text-sm">
              <SelectValue placeholder="Selecionar plano" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-sm">
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="outline" onClick={() => setShowNewPlan(true)}>
          <Plus size={13} className="mr-1" /> Novo plano
        </Button>
        {trackId && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleGerarClick}
            disabled={generateMutation.isPending}
          >
            <Zap size={13} className="mr-1" />
            {generateMutation.isPending ? "Gerando…" : "Gerar das minhas lacunas"}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setViewMode("kanban")}
            className="p-1.5 border"
            style={{
              background:
                viewMode === "kanban" ? "var(--color-accent-600, #416180)" : "transparent",
              color: viewMode === "kanban" ? "#fff" : "inherit",
            }}
            title="Kanban"
          >
            <Columns size={14} />
          </button>
          <button
            onClick={() => setViewMode("lista")}
            className="p-1.5 border"
            style={{
              background: viewMode === "lista" ? "var(--color-accent-600, #416180)" : "transparent",
              color: viewMode === "lista" ? "#fff" : "inherit",
            }}
            title="Lista"
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* No plans */}
      {plansQuery.isSuccess && plans.length === 0 && (
        <EmptyState
          title="Nenhum plano ainda"
          description="Crie um plano manualmente ou gere um a partir das suas lacunas de gap."
        />
      )}

      {/* Active plan content */}
      {activePlanId && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType(v as ItemType | "todos")}
            >
              <SelectTrigger className="w-32 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos" className="text-xs">
                  Todos os tipos
                </SelectItem>
                {(Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {ITEM_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {viewMode === "lista" && (
              <Select
                value={filterStatus}
                onValueChange={(v) => setFilterStatus(v as ItemStatus | "todos")}
              >
                <SelectTrigger className="w-36 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">
                    Todos os status
                  </SelectItem>
                  {COLUMNS.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs ml-auto"
              onClick={() => setShowNewItem(true)}
            >
              <Plus size={12} className="mr-1" /> Adicionar item
            </Button>
          </div>

          {itemsQuery.isLoading && <LoadingState />}

          {/* Kanban view */}
          {viewMode === "kanban" && itemsQuery.isSuccess && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {COLUMNS.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  items={itemsByStatus(status)}
                  onDrop={(id, newStatus) =>
                    moveItemMutation.mutate({ itemId: id, status: newStatus })
                  }
                  onStatusChange={(id, s) => moveItemMutation.mutate({ itemId: id, status: s })}
                  onDelete={(id) => deleteItemMutation.mutate(id)}
                  onLogHours={(item) => setLogTarget(item)}
                />
              ))}
            </div>
          )}

          {/* List view */}
          {viewMode === "lista" && itemsQuery.isSuccess && (
            <Blueprint>
              {filteredItems.length === 0 ? (
                <EmptyState title="Nenhum item" description="Adicione itens ao seu plano." />
              ) : (
                <div className="flex flex-col divide-y">
                  {filteredItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-3">
                      <div className="shrink-0">{STATUS_ICON[item.status]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.title}</div>
                        <div
                          className="text-xs flex gap-2 mt-0.5"
                          style={{ color: "var(--color-muted-foreground, #888)" }}
                        >
                          <span>{ITEM_TYPE_LABEL[item.type]}</span>
                          {item.dueDate && <span>{item.dueDate}</span>}
                          <span>{item.spentHours}h</span>
                        </div>
                      </div>
                      <Select
                        value={item.status}
                        onValueChange={(v) =>
                          moveItemMutation.mutate({ itemId: item.id, status: v as ItemStatus })
                        }
                      >
                        <SelectTrigger className="w-32 h-6 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLUMNS.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => setLogTarget(item)}
                        className="opacity-60 hover:opacity-100"
                      >
                        <Clock size={13} />
                      </button>
                      <button
                        onClick={() => deleteItemMutation.mutate(item.id)}
                        className="opacity-40 hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Blueprint>
          )}
        </>
      )}

      {/* Plano das lacunas já existe: refazer, adicionar novidades ou cancelar */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você já tem um plano gerado pelas lacunas</AlertDialogTitle>
            <AlertDialogDescription>
              O plano gerado pelas suas lacunas já existe para esta trilha. Quer refazer do zero com
              as lacunas de hoje, ou só adicionar o que for novo (mantendo seu progresso nos itens
              atuais)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generateMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="outline"
                loading={generateMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  generateMutation.mutate("adicionar_novas");
                }}
              >
                Adicionar só as novidades
              </Button>
            </AlertDialogAction>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                loading={generateMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  generateMutation.mutate("refazer");
                }}
              >
                Refazer do zero
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New plan dialog */}
      <Dialog open={showNewPlan} onOpenChange={setShowNewPlan}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo plano de estudos</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Título</Label>
              <Input
                value={newPlanTitle}
                onChange={(e) => setNewPlanTitle(e.target.value)}
                placeholder="ex: Q3 – Kubernetes e AWS"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewPlan(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createPlanMutation.mutate()}
              disabled={!newPlanTitle.trim() || createPlanMutation.isPending}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New item dialog */}
      <Dialog open={showNewItem} onOpenChange={setShowNewItem}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar item</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Título</Label>
              <Input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="ex: Curso Docker Avançado"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={newItemType} onValueChange={(v) => setNewItemType(v as ItemType)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => (
                      <SelectItem key={t} value={t} className="text-sm">
                        {ITEM_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Horas estimadas</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="ex: 20"
                  value={newItemHours}
                  onChange={(e) => setNewItemHours(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">URL do recurso (opcional)</Label>
              <Input
                className="h-8 text-sm"
                value={newItemUrl}
                onChange={(e) => setNewItemUrl(e.target.value)}
                placeholder="https://…"
                type="url"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewItem(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createItemMutation.mutate()}
              disabled={!newItemTitle.trim() || createItemMutation.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log hours dialog */}
      <Dialog
        open={!!logTarget}
        onOpenChange={(open) => {
          if (!open) setLogTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar horas — {logTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Horas estudadas hoje</Label>
              <Input
                value={logHours}
                onChange={(e) => setLogHours(e.target.value)}
                inputMode="decimal"
                placeholder="ex: 1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLogTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => logMutation.mutate()}
              disabled={!Number(logHours) || logMutation.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
