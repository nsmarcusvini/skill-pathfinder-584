import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Plus, Search, Sparkles, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMarket } from "@/hooks/use-market";
import { useRecomputeGap } from "@/hooks/use-gap";
import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { SkillBadge, type SkillStatus } from "@/components/rumvia/skill-badge";
import { EmptyState, LoadingState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_conta/minhas-skills")({
  head: () => ({
    meta: [
      { title: "Minhas skills — RUMVIA" },
      {
        name: "description",
        content: "Revise seu nível em cada skill, adicione o que faltou e veja o que a sua trilha exige.",
      },
      { property: "og:title", content: "Minhas skills — RUMVIA" },
      { property: "og:description", content: "Curadoria do seu perfil técnico no RUMVIA." },
    ],
  }),
  component: MinhasSkillsPage,
});

/** Legenda oficial da escala de nível. */
export const LEVEL_LABEL: Record<number, string> = {
  0: "não conheço",
  1: "básico",
  2: "uso com ajuda",
  3: "autônomo",
  4: "avançado",
  5: "referência/mentor",
};

type CatalogSkill = {
  id: string;
  canonical_name: string;
  category_id: string | null;
};

type CategoryRow = { id: string; key: string; name: string; sort_order: number };

type UserSkillRow = {
  skill_id: string;
  level: number;
  years: number | null;
  last_used_year: number | null;
  source: string;
  is_verified: boolean;
};

type BaselineRow = {
  skill_id: string;
  importance: number;
  required_level: number;
  is_core: boolean;
};

/** Snapshot para o desfazer: null = a skill não existia antes. */
type Snapshot = { skillId: string; before: UserSkillRow | null };

function statusFor(level: number, required: number | null): SkillStatus {
  if (required == null) return "extra";
  if (level >= required && level > 0) return "dominada";
  if (level > 0) return "parcial";
  return "faltante";
}

function MinhasSkillsPage() {
  const { user, profile } = useAuth();
  const { track } = useMarket();
  const queryClient = useQueryClient();
  const recomputeGap = useRecomputeGap();

  const userId = user?.id ?? null;
  const trackId = track?.id ?? null;
  const seniority = profile?.seniority ?? "pleno";

  const [busca, setBusca] = React.useState("");
  const [categoria, setCategoria] = React.useState("todas");
  const [selecionadas, setSelecionadas] = React.useState<string[]>([]);

  const catalogQuery = useQuery({
    queryKey: ["skills_catalog"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [skills, categories, aliases] = await Promise.all([
        supabase.from("skills").select("id, canonical_name, category_id"),
        supabase.from("skill_categories").select("id, key, name, sort_order"),
        supabase.from("skill_aliases").select("skill_id, alias"),
      ]);
      if (skills.error) throw skills.error;
      if (categories.error) throw categories.error;
      if (aliases.error) throw aliases.error;
      return {
        skills: (skills.data ?? []) as CatalogSkill[],
        categories: (categories.data ?? []) as CategoryRow[],
        aliases: (aliases.data ?? []) as { skill_id: string; alias: string }[],
      };
    },
  });

  const userSkillsQuery = useQuery({
    queryKey: ["user_skills", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_skills")
        .select("skill_id, level, years, last_used_year, source, is_verified")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as UserSkillRow[];
    },
  });

  const baselineQuery = useQuery({
    queryKey: ["baselines", trackId, seniority],
    enabled: Boolean(trackId),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("track_skill_baselines")
        .select("skill_id, importance, required_level, is_core")
        .eq("track_id", trackId!)
        .eq("seniority", seniority);
      if (error) throw error;
      return (data ?? []) as BaselineRow[];
    },
  });

  const catalog = catalogQuery.data;
  const userSkills = React.useMemo(() => userSkillsQuery.data ?? [], [userSkillsQuery.data]);
  const baselines = React.useMemo(() => baselineQuery.data ?? [], [baselineQuery.data]);

  const skillById = React.useMemo(
    () => new Map((catalog?.skills ?? []).map((s) => [s.id, s])),
    [catalog],
  );
  const categoryById = React.useMemo(
    () => new Map((catalog?.categories ?? []).map((c) => [c.id, c])),
    [catalog],
  );
  const baselineBySkill = React.useMemo(
    () => new Map(baselines.map((b) => [b.skill_id, b])),
    [baselines],
  );
  const userSkillBySkill = React.useMemo(
    () => new Map(userSkills.map((u) => [u.skill_id, u])),
    [userSkills],
  );
  const aliasesBySkill = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of catalog?.aliases ?? []) {
      const list = map.get(a.skill_id) ?? [];
      list.push(a.alias);
      map.set(a.skill_id, list);
    }
    return map;
  }, [catalog]);

  // --------------------------------------------------------------- mutações

  const applyRows = React.useCallback(
    async (rows: { skillId: string; row: UserSkillRow | null }[]) => {
      if (!userId) return;
      const toDelete = rows.filter((r) => r.row === null).map((r) => r.skillId);
      const toUpsert = rows
        .filter((r) => r.row !== null)
        .map((r) => ({ ...(r.row as UserSkillRow), user_id: userId }));

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("user_skills")
          .delete()
          .eq("user_id", userId)
          .in("skill_id", toDelete);
        if (error) throw error;
      }
      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("user_skills")
          .upsert(toUpsert, { onConflict: "user_id,skill_id" });
        if (error) throw error;
      }
    },
    [userId],
  );

  const afterChange = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["user_skills", userId] });
    // Recálculo em background: o dashboard reflete o novo score sem reload.
    recomputeGap();
  }, [queryClient, recomputeGap, userId]);

  const mutation = useMutation({
    mutationFn: async (input: {
      rows: { skillId: string; row: UserSkillRow | null }[];
      snapshots: Snapshot[];
      message: string;
    }) => {
      await applyRows(input.rows);
      return input;
    },
    onSuccess: async (input) => {
      await afterChange();
      toast.success(input.message, {
        action: {
          label: "Desfazer",
          onClick: () => {
            void (async () => {
              try {
                await applyRows(input.snapshots.map((s) => ({ skillId: s.skillId, row: s.before })));
                await afterChange();
                toast.success("Alteração desfeita.");
              } catch (err) {
                toast.error((err as Error).message);
              }
            })();
          },
        },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const salvar = React.useCallback(
    (
      changes: { skillId: string; row: UserSkillRow | null }[],
      message: string,
    ) => {
      const snapshots: Snapshot[] = changes.map((c) => ({
        skillId: c.skillId,
        before: userSkillBySkill.get(c.skillId) ?? null,
      }));
      mutation.mutate({ rows: changes, snapshots, message });
    },
    [mutation, userSkillBySkill],
  );

  const patchSkill = React.useCallback(
    (skillId: string, patch: Partial<UserSkillRow>, message: string) => {
      const atual = userSkillBySkill.get(skillId);
      const row: UserSkillRow = {
        skill_id: skillId,
        level: atual?.level ?? 0,
        years: atual?.years ?? null,
        last_used_year: atual?.last_used_year ?? null,
        source: atual?.source ?? "manual",
        is_verified: atual?.is_verified ?? false,
        ...patch,
      };
      salvar([{ skillId, row }], message);
    },
    [salvar, userSkillBySkill],
  );

  // ------------------------------------------------------------------ lista

  const termo = busca.trim().toLowerCase();

  const itens = React.useMemo(() => {
    return userSkills
      .map((u) => {
        const skill = skillById.get(u.skill_id);
        const cat = skill?.category_id ? categoryById.get(skill.category_id) : undefined;
        return {
          user: u,
          name: skill?.canonical_name ?? "Skill",
          categoryId: skill?.category_id ?? null,
          categoryName: cat?.name ?? "Sem categoria",
          sortOrder: cat?.sort_order ?? 99,
          required: baselineBySkill.get(u.skill_id)?.required_level ?? null,
        };
      })
      .filter((i) => (categoria === "todas" ? true : i.categoryId === categoria))
      .filter((i) => {
        if (!termo) return true;
        if (i.name.toLowerCase().includes(termo)) return true;
        return (aliasesBySkill.get(i.user.skill_id) ?? []).some((a) =>
          a.toLowerCase().includes(termo),
        );
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
  }, [userSkills, skillById, categoryById, baselineBySkill, categoria, termo, aliasesBySkill]);

  const grupos = React.useMemo(() => {
    const map = new Map<string, typeof itens>();
    for (const item of itens) {
      const list = map.get(item.categoryName) ?? [];
      list.push(item);
      map.set(item.categoryName, list);
    }
    return [...map.entries()];
  }, [itens]);

  const sugeridas = React.useMemo(() => {
    return baselines
      .filter((b) => !userSkillBySkill.has(b.skill_id))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 12)
      .map((b) => ({
        ...b,
        name: skillById.get(b.skill_id)?.canonical_name ?? "Skill",
      }));
  }, [baselines, userSkillBySkill, skillById]);

  const naoAdicionadas = React.useMemo(
    () => (catalog?.skills ?? []).filter((s) => !userSkillBySkill.has(s.id)),
    [catalog, userSkillBySkill],
  );

  const toggleSelecionada = (skillId: string) =>
    setSelecionadas((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId],
    );

  const loading = catalogQuery.isLoading || userSkillsQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Perfil técnico"
        title="Minhas skills"
        subtitle={`${userSkills.length} skills no seu perfil · trilha ${track?.name ?? "—"} · ${seniority}`}
        actions={
          <AddSkillCombobox
            skills={naoAdicionadas}
            aliasesBySkill={aliasesBySkill}
            onAdd={(skillId, name) =>
              patchSkill(
                skillId,
                { level: 3, source: "manual", last_used_year: new Date().getFullYear() },
                `“${name}” adicionada.`,
              )
            }
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500"
                aria-hidden
              />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por skill ou sinônimo"
                aria-label="Buscar skill"
                className="pl-9"
              />
            </div>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="sm:w-56" aria-label="Filtrar por categoria">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {(catalog?.categories ?? [])
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {selecionadas.length > 0 ? (
            <Blueprint className="flex flex-wrap items-center gap-2 p-3">
              <span className="text-caption text-neutral-700">
                {selecionadas.length} selecionada(s)
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                {[3, 4, 5].map((lvl) => (
                  <Button
                    key={lvl}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const changes = selecionadas.map((skillId) => {
                        const atual = userSkillBySkill.get(skillId);
                        return {
                          skillId,
                          row: {
                            skill_id: skillId,
                            level: lvl,
                            years: atual?.years ?? null,
                            last_used_year: atual?.last_used_year ?? null,
                            source: atual?.source ?? "manual",
                            is_verified: atual?.is_verified ?? false,
                          } as UserSkillRow,
                        };
                      });
                      salvar(changes, `Nível ${lvl} aplicado a ${changes.length} skills.`);
                      setSelecionadas([]);
                    }}
                  >
                    Nível {lvl}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    const changes = selecionadas.map((skillId) => ({ skillId, row: null }));
                    salvar(changes, `${changes.length} skills removidas.`);
                    setSelecionadas([]);
                  }}
                >
                  <Trash2 className="mr-1 size-3.5" aria-hidden />
                  Remover
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelecionadas([])}>
                  Limpar seleção
                </Button>
              </div>
            </Blueprint>
          ) : null}

          {loading ? (
            <LoadingState />
          ) : grupos.length === 0 ? (
            <EmptyState
              title="Nenhuma skill nesta visão"
              description="Ajuste a busca ou adicione skills manualmente. O envio de CV também popula esta lista."
            />
          ) : (
            grupos.map(([nome, lista]) => (
              <section key={nome} className="flex flex-col gap-2">
                <h2 className="label-h6 text-neutral-700">
                  {nome} <span className="num text-neutral-500">({lista.length})</span>
                </h2>
                <div className="flex flex-col">
                  {lista.map((item) => (
                    <SkillRow
                      key={item.user.skill_id}
                      name={item.name}
                      row={item.user}
                      required={item.required}
                      selected={selecionadas.includes(item.user.skill_id)}
                      onToggleSelect={() => toggleSelecionada(item.user.skill_id)}
                      onPatch={(patch, message) => patchSkill(item.user.skill_id, patch, message)}
                      onRemove={() =>
                        salvar(
                          [{ skillId: item.user.skill_id, row: null }],
                          `“${item.name}” removida.`,
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <Blueprint className="p-4">
            <h2 className="label-h6 flex items-center gap-2 text-neutral-700">
              <Sparkles className="size-4" aria-hidden />
              Sugeridas para a sua trilha
            </h2>
            <p className="mt-1 text-caption text-neutral-700">
              Alta importância no baseline de {track?.name ?? "sua trilha"} · {seniority} e ainda
              fora do seu perfil.
            </p>
            <div className="mt-3 flex flex-col">
              {sugeridas.length === 0 ? (
                <p className="text-caption text-neutral-500">
                  Nada pendente por aqui — o baseline da trilha está coberto.
                </p>
              ) : (
                sugeridas.map((s) => (
                  <div
                    key={s.skill_id}
                    className="flex items-center gap-2 border-t border-neutral-200 py-2 first:border-t-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-neutral-900">{s.name}</p>
                      <p className="num text-caption text-neutral-500">
                        importância {s.importance} · nível alvo {s.required_level}
                        {s.is_core ? " · core" : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Adicionar ${s.name}`}
                      onClick={() =>
                        patchSkill(
                          s.skill_id,
                          {
                            level: s.required_level,
                            source: "manual",
                            last_used_year: new Date().getFullYear(),
                          },
                          `“${s.name}” adicionada.`,
                        )
                      }
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Blueprint>
        </aside>
      </div>
    </div>
  );
}

function SkillRow({
  name,
  row,
  required,
  selected,
  onToggleSelect,
  onPatch,
  onRemove,
}: {
  name: string;
  row: UserSkillRow;
  required: number | null;
  selected: boolean;
  onToggleSelect: () => void;
  onPatch: (patch: Partial<UserSkillRow>, message: string) => void;
  onRemove: () => void;
}) {
  const [level, setLevel] = React.useState(row.level);
  React.useEffect(() => setLevel(row.level), [row.level]);

  return (
    <div className="flex flex-col gap-3 border-t border-neutral-200 py-3 first:border-t-0 md:flex-row md:items-center">
      <div className="flex items-center gap-3 md:w-64">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Selecionar ${name}`}
        />
        <SkillBadge name={name} status={statusFor(level, required)} />
      </div>

      <div className="flex flex-1 items-center gap-3">
        <Slider
          value={[level]}
          min={0}
          max={5}
          step={1}
          className="max-w-56"
          aria-label={`Nível em ${name}`}
          onValueChange={(v) => setLevel(v[0] ?? 0)}
          onValueCommit={(v) =>
            onPatch({ level: v[0] ?? 0 }, `“${name}” agora é nível ${v[0] ?? 0}.`)
          }
        />
        <span className="num min-w-40 text-caption text-neutral-700">
          {level} — {LEVEL_LABEL[level]}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-caption text-neutral-500" htmlFor={`anos-${row.skill_id}`}>
          Anos
        </label>
        <Input
          id={`anos-${row.skill_id}`}
          type="number"
          min={0}
          max={50}
          step={0.5}
          defaultValue={row.years ?? ""}
          className="num w-20"
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== (row.years ?? null)) onPatch({ years: v }, `Anos de “${name}” atualizados.`);
          }}
        />
        <label className="text-caption text-neutral-500" htmlFor={`ano-${row.skill_id}`}>
          Último ano
        </label>
        <Input
          id={`ano-${row.skill_id}`}
          type="number"
          min={1980}
          max={new Date().getFullYear()}
          defaultValue={row.last_used_year ?? ""}
          className="num w-24"
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== (row.last_used_year ?? null))
              onPatch({ last_used_year: v }, `Último uso de “${name}” atualizado.`);
          }}
        />
        <Button size="sm" variant="ghost" aria-label={`Remover ${name}`} onClick={onRemove}>
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function AddSkillCombobox({
  skills,
  aliasesBySkill,
  onAdd,
}: {
  skills: CatalogSkill[];
  aliasesBySkill: Map<string, string[]>;
  onAdd: (skillId: string, name: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default">
          <Plus className="mr-1 size-4" aria-hidden />
          Adicionar skill
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command
          filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Buscar no catálogo (pt-BR ou inglês)" />
          <CommandList>
            <CommandEmpty>Nenhuma skill encontrada no catálogo.</CommandEmpty>
            <CommandGroup>
              {skills.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.canonical_name} ${(aliasesBySkill.get(s.id) ?? []).join(" ")}`}
                  onSelect={() => {
                    onAdd(s.id, s.canonical_name);
                    setOpen(false);
                  }}
                >
                  <Check className="mr-2 size-3.5 opacity-0" aria-hidden />
                  {s.canonical_name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
