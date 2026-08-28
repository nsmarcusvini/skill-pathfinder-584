import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, ToggleLeft, ToggleRight } from "lucide-react";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { LoadingState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { listTracks, toggleTrack, upsertTrack, type AdminTrack } from "@/lib/admin.functions";

export const Route = createFileRoute("/_conta/admin/trilhas")({
  component: AdminTrilhasPage,
});

const EMPTY_FORM = { id: undefined as string | undefined, key: "", name: "", role_variants: "" };

function AdminTrilhasPage() {
  const qc = useQueryClient();
  const listRun = useServerFn(listTracks);
  const toggleRun = useServerFn(toggleTrack);
  const upsertRun = useServerFn(upsertTrack);

  const [form, setForm] = React.useState(EMPTY_FORM);
  const [open, setOpen] = React.useState(false);

  const tracksQuery = useQuery({
    queryKey: ["admin", "tracks"],
    queryFn: () => listRun({}),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "tracks"] });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) => toggleRun({ data: input }),
    onSuccess: () => {
      invalidate();
      toast.success("Trilha atualizada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertMutation = useMutation({
    mutationFn: () =>
      upsertRun({
        data: {
          ...(form.id ? { id: form.id } : {}),
          key: form.key.trim(),
          name: form.name.trim(),
          role_variants: form.role_variants
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success(
        form.id ? "Trilha atualizada." : "Trilha criada. Adicione skills via migração de banco.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(t: AdminTrack) {
    setForm({ id: t.id, key: t.key, name: t.name, role_variants: t.role_variants.join("\n") });
    setOpen(true);
  }

  const tracks = tracksQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Trilhas de carreira"
        subtitle="Gerencie as trilhas ativas. Adicionar trilha = dados no banco, zero mudança de código."
      />

      <div className="flex justify-end">
        <Button onClick={openNew} size="sm">
          <Plus size={13} className="mr-1" /> Nova trilha
        </Button>
      </div>

      {tracksQuery.isLoading && <LoadingState />}

      <div className="flex flex-col gap-3">
        {tracks.map((t) => (
          <Blueprint key={t.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base uppercase tracking-wide">{t.name}</span>
                  <code className="text-xs px-1 border" style={{ fontFamily: "monospace" }}>
                    {t.key}
                  </code>
                  {!t.is_active && (
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{ color: "var(--color-muted-foreground, #888)" }}
                    >
                      inativa
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {t.role_variants.map((r) => (
                    <span
                      key={r}
                      className="text-xs px-1.5 py-0.5 border"
                      style={{ color: "var(--color-muted-foreground, #888)" }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <div
                  className="flex items-center gap-3 text-xs"
                  style={{ color: "var(--color-muted-foreground, #888)" }}
                >
                  <span>{t.skills_count} skills</span>
                  <span>{t.jobs_br.toLocaleString("pt-BR")} vagas BR</span>
                  <span>{t.jobs_global.toLocaleString("pt-BR")} vagas global</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    title={t.is_active ? "Desativar trilha" : "Ativar trilha"}
                    onClick={() => toggleMutation.mutate({ id: t.id, is_active: !t.is_active })}
                    className="opacity-60 hover:opacity-100"
                  >
                    {t.is_active ? (
                      <ToggleRight size={18} style={{ color: "var(--color-success)" }} />
                    ) : (
                      <ToggleLeft size={18} />
                    )}
                  </button>
                  <button onClick={() => openEdit(t)} className="opacity-60 hover:opacity-100">
                    <Pencil size={13} />
                  </button>
                </div>
              </div>
            </div>
          </Blueprint>
        ))}
      </div>

      <div
        className="border-t pt-4 text-xs"
        style={{ color: "var(--color-muted-foreground, #888)" }}
      >
        Para adicionar skills a uma trilha nova, siga <code>docs/ADICIONAR_TRILHA.md</code>.
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar trilha" : "Nova trilha"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Chave (snake_case)</Label>
              <Input
                className="h-8 text-sm font-mono"
                placeholder="ex: backend"
                value={form.key}
                disabled={!!form.id}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              />
              {!form.id && (
                <p className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                  Só letras minúsculas e _. Imutável depois de criado.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Nome exibido</Label>
              <Input
                className="h-8 text-sm"
                placeholder="ex: Backend Engineer"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Variantes de cargo (uma por linha)</Label>
              <Textarea
                className="text-sm font-mono h-28"
                placeholder={"Backend Engineer\nAPI Developer\nServer-Side Developer"}
                value={form.role_variants}
                onChange={(e) => setForm((f) => ({ ...f, role_variants: e.target.value }))}
              />
              <p className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                Usadas para filtrar vagas por trilha. Mínimo 1.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !form.key.trim() ||
                !form.name.trim() ||
                !form.role_variants.trim() ||
                upsertMutation.isPending
              }
              onClick={() => upsertMutation.mutate()}
            >
              {form.id ? "Salvar" : "Criar trilha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
