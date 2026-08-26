import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { importCsvJobs } from "@/lib/admin.functions";
import { CSV_COLUMNS, parseCsv, type CsvRowResult } from "@/lib/ingest/adapters/csv-manual";

export const Route = createFileRoute("/_conta/admin/importar")({
  component: ImportarPage,
});

function ImportarPage() {
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const importFn = useServerFn(importCsvJobs);

  const rows: CsvRowResult[] = useMemo(() => (content ? parseCsv(content) : []), [content]);
  const validRows = rows.filter((r) => r.job);
  const invalidRows = rows.filter((r) => !r.job);

  const importMutation = useMutation({
    mutationFn: () => importFn({ data: { content, source_key: "csv_manual" } }),
    onSuccess: (result) => {
      toast.success(`Importação concluída: ${result.created} novas, ${result.updated} atualizadas.`, {
        description: result.rejected > 0 ? `${result.rejected} linha(s) rejeitada(s).` : undefined,
      });
      setContent("");
      setFilename(null);
    },
    onError: (error: Error) => toast.error("Falha na importação", { description: error.message }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Importar CSV"
        subtitle="Cobre vagas brasileiras que nenhuma API gratuita entrega. Cada linha é validada antes de importar."
      />

      <section className="flex flex-col gap-3 border border-divider bg-bg p-4">
        <label className="font-mono text-[12px] uppercase tracking-wide text-text-muted" htmlFor="csv-file">
          Arquivo CSV
        </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setFilename(file.name);
            setContent(await file.text());
          }}
        />
        <p className="font-mono text-[12px] text-text-muted">
          Colunas aceitas: {CSV_COLUMNS.join(", ")}
        </p>
      </section>

      {rows.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-base uppercase tracking-wide">
              Pré-visualização{filename ? ` — ${filename}` : ""}
            </span>
            <Badge variant="default">{validRows.length} válidas</Badge>
            <Badge variant={invalidRows.length > 0 ? "danger" : "neutral"}>{invalidRows.length} com erro</Badge>
            <Button
              className="ml-auto"
              disabled={validRows.length === 0}
              loading={importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              Importar {validRows.length} vaga(s)
            </Button>
          </div>

          <div className="overflow-x-auto border border-divider">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface text-left font-mono text-[12px] uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Empresa</th>
                  <th className="px-3 py-2">Local</th>
                  <th className="px-3 py-2">Salário</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row) => (
                  <tr key={row.line} className="border-t border-divider">
                    <td className="px-3 py-2 font-mono">{row.line}</td>
                    <td className="px-3 py-2">{row.job?.title ?? "—"}</td>
                    <td className="px-3 py-2">{row.job?.company_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.job?.location_raw ?? "—"} {row.job?.is_remote ? "· remoto" : ""}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {row.job?.salary_min || row.job?.salary_max
                        ? `${row.job?.salary_min ?? "?"}–${row.job?.salary_max ?? "?"} ${row.job?.salary_currency ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.errors.length === 0 ? (
                        <Badge variant="default">ok</Badge>
                      ) : (
                        <span className="text-[12px] text-danger">{row.errors.join("; ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 100 ? (
            <p className="font-mono text-[12px] text-text-muted">Mostrando as 100 primeiras de {rows.length} linhas.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
