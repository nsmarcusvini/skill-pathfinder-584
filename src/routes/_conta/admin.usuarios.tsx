import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState, LoadingState, ErrorState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { listUsers, setUserAdmin, setUserActive, type AdminUser } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_conta/admin/usuarios")({
  component: AdminUsuariosPage,
});

type Filtro = "todos" | "permanentes" | "anonimos" | "admins" | "desativados";

const FILTROS: Array<{ key: Filtro; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "permanentes", label: "Contas permanentes" },
  { key: "anonimos", label: "Anônimos" },
  { key: "admins", label: "Admins" },
  { key: "desativados", label: "Desativados" },
];

function fmtData(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function AdminUsuariosPage() {
  const { user: eu } = useAuth();
  const qc = useQueryClient();
  const carregar = useServerFn(listUsers);
  const mudarAdmin = useServerFn(setUserAdmin);
  const mudarAtivo = useServerFn(setUserActive);

  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("permanentes");

  const usuariosQuery = useQuery({
    queryKey: ["admin", "usuarios"],
    queryFn: () => carregar(),
  });

  const adminMut = useMutation({
    mutationFn: (v: { userId: string; isAdmin: boolean }) => mudarAdmin({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.isAdmin ? "Acesso de admin concedido." : "Acesso de admin removido.");
      void qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ativoMut = useMutation({
    mutationFn: (v: { userId: string; active: boolean }) => mudarAtivo({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.active ? "Conta reativada." : "Conta desativada.");
      void qc.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // useMemo evita recriar o array a cada render e invalidar os memos abaixo.
  const todos = React.useMemo(() => usuariosQuery.data ?? [], [usuariosQuery.data]);

  const visiveis = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return todos
      .filter((u) => {
        if (filtro === "permanentes" && u.isAnonymous) return false;
        if (filtro === "anonimos" && !u.isAnonymous) return false;
        if (filtro === "admins" && !u.isAdmin) return false;
        if (filtro === "desativados" && !u.isBanned) return false;
        if (!termo) return true;
        return (
          (u.email ?? "").toLowerCase().includes(termo) ||
          (u.fullName ?? "").toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => {
        if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [todos, busca, filtro]);

  const totais = React.useMemo(
    () => ({
      total: todos.length,
      permanentes: todos.filter((u) => !u.isAnonymous).length,
      anonimos: todos.filter((u) => u.isAnonymous).length,
      admins: todos.filter((u) => u.isAdmin).length,
    }),
    [todos],
  );

  if (usuariosQuery.isPending) return <LoadingState />;
  if (usuariosQuery.isError) {
    return (
      <ErrorState
        description="Não foi possível carregar os usuários."
        onRetry={() => void usuariosQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Usuários"
        subtitle="Quem usa o RUMVIA, quem é administrador e quais contas estão ativas."
      />

      <div className="grid grid-cols-2 gap-px bg-divider md:grid-cols-4">
        {[
          { label: "Total", valor: totais.total },
          { label: "Contas permanentes", valor: totais.permanentes },
          { label: "Anônimos", valor: totais.anonimos },
          { label: "Administradores", valor: totais.admins },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1 bg-bg p-4">
            <span className="label-h6 text-neutral-500">{s.label}</span>
            <span className="num font-heading text-h3 text-neutral-900">{s.valor}</span>
          </div>
        ))}
      </div>

      <Blueprint className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="label-h6 text-neutral-700">Buscar</span>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="E-mail ou nome"
            aria-label="Buscar usuário"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              aria-pressed={filtro === f.key}
              className={cn(
                "cursor-pointer border px-3 py-1.5 text-caption transition-colors",
                filtro === f.key
                  ? "border-accent-700 bg-accent-100 text-accent-800"
                  : "border-divider text-neutral-700 hover:bg-surface",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Blueprint>

      {visiveis.length === 0 ? (
        <EmptyState
          title="Nenhum usuário com esses filtros"
          description="Ajuste a busca ou escolha outro filtro."
        />
      ) : (
        <ul className="flex flex-col gap-px bg-divider">
          {visiveis.map((u) => (
            <LinhaUsuario
              key={u.id}
              u={u}
              souEu={u.id === eu?.id}
              ocupado={adminMut.isPending || ativoMut.isPending}
              onAdmin={(v) => adminMut.mutate({ userId: u.id, isAdmin: v })}
              onAtivo={(v) => ativoMut.mutate({ userId: u.id, active: v })}
            />
          ))}
        </ul>
      )}

      <p className="text-caption text-neutral-600">
        Contas anônimas são visitantes que enviaram currículo sem se cadastrar. Elas são apagadas
        automaticamente após 7 dias sem acesso e não podem receber acesso de administrador.
      </p>
    </div>
  );
}

function LinhaUsuario({
  u,
  souEu,
  ocupado,
  onAdmin,
  onAtivo,
}: {
  u: AdminUser;
  souEu: boolean;
  ocupado: boolean;
  onAdmin: (v: boolean) => void;
  onAtivo: (v: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 bg-bg p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-semibold text-neutral-900">
            {u.fullName || u.email || "(sem nome)"}
          </span>
          {u.isAdmin ? <Badge className="bg-accent-700">admin</Badge> : null}
          {souEu ? <Badge variant="outline">você</Badge> : null}
          {u.isAnonymous ? <Badge variant="outline">anônimo</Badge> : null}
          {u.isBanned ? <Badge variant="danger">desativado</Badge> : null}
          {!u.isAnonymous && !u.emailConfirmed ? (
            <Badge variant="outline">e-mail não confirmado</Badge>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-caption text-neutral-600">
          {u.email ? <span>{u.email}</span> : null}
          {u.trackName ? <span>{u.trackName}</span> : null}
          {u.seniority ? <span>{u.seniority}</span> : null}
          <span>criado {fmtData(u.createdAt)}</span>
          <span>último acesso {fmtData(u.lastSignInAt)}</span>
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 text-caption text-neutral-600">
          <span>{u.gapAnalyses} análise(s)</span>
          <span>{u.studyPlans} plano(s) de estudo</span>
          <span>{u.certifications} certificação(ões)</span>
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {!u.isAnonymous ? (
          <Button
            variant="outline"
            size="sm"
            disabled={ocupado || (souEu && u.isAdmin)}
            title={
              souEu && u.isAdmin ? "Você não pode remover o próprio acesso de admin" : undefined
            }
            onClick={() => onAdmin(!u.isAdmin)}
          >
            {u.isAdmin ? (
              <>
                <ShieldOff className="size-4" aria-hidden />
                Remover admin
              </>
            ) : (
              <>
                <ShieldCheck className="size-4" aria-hidden />
                Tornar admin
              </>
            )}
          </Button>
        ) : null}

        <Button
          variant={u.isBanned ? "outline" : "ghost"}
          size="sm"
          disabled={ocupado || souEu}
          title={souEu ? "Você não pode desativar a própria conta" : undefined}
          onClick={() => onAtivo(u.isBanned)}
        >
          {u.isBanned ? (
            <>
              <UserCheck className="size-4" aria-hidden />
              Reativar
            </>
          ) : (
            <>
              <UserX className="size-4" aria-hidden />
              Desativar
            </>
          )}
        </Button>
      </div>
    </li>
  );
}
