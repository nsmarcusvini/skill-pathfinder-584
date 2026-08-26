import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approvePendingTerm,
  jdHealth,
  listPendingTerms,
  rejectPendingTerm,
  runJdExtraction,
  searchSkillsAdmin,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_conta/admin/skills")({
  component: AdminSkills,
});

function AdminSkills() {
  const queryClient = useQueryClient();
  const fetchHealth = useServerFn(jdHealth);
  const fetchTerms = useServerFn(listPendingTerms);
  const runExtraction = useServerFn(runJdExtraction);
  const approve = useServerFn(approvePendingTerm);
  const reject = useServerFn(rejectPendingTerm);
  const searchSkills = useServerFn(searchSkillsAdmin);

  const health = useQuery({ queryKey: ["admin", "jd-health"], queryFn: () => fetchHealth({}) });
  const terms = useQuery({ queryKey: ["admin", "pending-terms"], queryFn: () => fetchTerms({}) });

  const [query, setQuery] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Array<{ id: string; canonical_name: string }>>>({});

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "pending-terms"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "jd-health"] });
  };

  const extractionMutation = useMutation({
    mutationFn: (force: boolean) => runExtraction({ data: { force } }),
    onSuccess: (result) => {
      toast.success(
        `${result.processed} vagas processadas, ${result.skills_written} skills gravadas, ${result.remaining} na fila.`,
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approveMutation = useMutation({
    mutationFn: (input: { id: string; mode: "alias" | "new_skill"; skill_id?: string }) =>
      approve({ data: input }),
    onSuccess: (result) => {
      toast.success(`Termo aprovado. ${result.requeued} vagas enfileiradas para reprocessamento.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => reject({ data: { id } }),
    onSuccess: () => {
      toast.success("Termo rejeitado e adicionado à blocklist.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const metrics = health.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Curadoria de skills"
        subtitle="Fila de termos desconhecidos minerados das vagas e saúde da extração determinística."
      />

      <section className="grid gap-px bg-divider md:grid-cols-4">
        <Metric label="Vagas processadas" value={`${metrics?.jobs_extracted ?? "—"} / ${metrics?.jobs_total ?? "—"}`} />
        <Metric label="Mediana skills/vaga" value={metrics ? String(metrics.median_skills_per_job) : "—"} />
        <Metric
          label="% com menos de 3 skills"
          value={metrics ? `${metrics.pct_jobs_below_three}%` : "—"}
          warning={metrics?.dictionary_gap}
        />
        <Metric label="Termos na fila" value={metrics ? String(metrics.pending_terms) : "—"} />
      </section>

      {metrics?.dictionary_gap ? (
        <p className="border border-warning bg-warning-soft p-3 text-sm">
          Mais de 15% das vagas ficaram com menos de 3 skills: o dicionário tem buraco. Cure a fila abaixo.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => extractionMutation.mutate(false)} disabled={extractionMutation.isPending}>
          Extrair lote pendente
        </Button>
        <Button variant="outline" onClick={() => extractionMutation.mutate(true)} disabled={extractionMutation.isPending}>
          Reprocessar lote (forçado)
        </Button>
      </div>

      <section className="border border-divider">
        <header className="border-b border-divider bg-surface px-3 py-2 font-mono text-[12px] uppercase tracking-wide">
          Fila de termos (3+ vagas distintas)
        </header>
        {terms.isLoading ? <p className="p-3 text-sm text-text-muted">Carregando…</p> : null}
        {terms.data?.length === 0 ? <p className="p-3 text-sm text-text-muted">Nada para curar agora.</p> : null}
        <ul className="divide-y divide-divider">
          {(terms.data ?? []).map((term) => (
            <li key={term.id} className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-display text-base uppercase tracking-wide">{term.term}</span>
                <span className="font-mono text-[12px] text-text-muted">
                  {term.occurrences} ocorrências · {term.distinct_jobs} vagas · {term.lang}
                </span>
                {term.suggested_skill_name ? (
                  <span className="font-mono text-[12px] text-accent">parecido com {term.suggested_skill_name}</span>
                ) : null}
              </div>
              {term.example_snippet ? (
                <p className="text-sm text-text-muted">“{term.example_snippet}”</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-56"
                  placeholder="Buscar skill para alias"
                  value={query[term.id] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuery((prev) => ({ ...prev, [term.id]: value }));
                    if (value.length >= 2) {
                      void searchSkills({ data: { q: value } }).then((rows) =>
                        setResults((prev) => ({ ...prev, [term.id]: rows })),
                      );
                    }
                  }}
                />
                {term.suggested_skill_id ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      approveMutation.mutate({
                        id: term.id,
                        mode: "alias",
                        skill_id: term.suggested_skill_id!,
                      })
                    }
                  >
                    Alias de {term.suggested_skill_name}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => approveMutation.mutate({ id: term.id, mode: "new_skill" })}>
                  Criar skill nova
                </Button>
                <Button variant="ghost" onClick={() => rejectMutation.mutate(term.id)}>
                  Rejeitar
                </Button>
              </div>

              {(results[term.id] ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {(results[term.id] ?? []).map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      className="border border-divider px-2 py-1 font-mono text-[12px] hover:bg-surface"
                      onClick={() => approveMutation.mutate({ id: term.id, mode: "alias", skill_id: skill.id })}
                    >
                      {skill.canonical_name}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value, warning }: { label: string; value: string; warning?: boolean | undefined }) {
  return (
    <div className="bg-bg p-4">
      <div className="font-mono text-[12px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`font-display text-2xl ${warning ? "text-danger" : ""}`}>{value}</div>
    </div>
  );
}
