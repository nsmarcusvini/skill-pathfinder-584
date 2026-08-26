import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState, LoadingState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseCv } from "@/lib/cv.functions";

export const Route = createFileRoute("/_conta/cv")({
  head: () => ({
    meta: [
      { title: "Meu CV — RUMVIA" },
      {
        name: "description",
        content: "Envie seu currículo e revise as skills detectadas antes de entrarem no seu perfil.",
      },
      { property: "og:title", content: "Meu CV — RUMVIA" },
      { property: "og:description", content: "Gerencie o currículo analisado pelo RUMVIA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CvPage,
});

const MIME_PDF = "application/pdf";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface CvRow {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  is_current: boolean;
  status: "uploaded" | "parsing" | "parsed" | "failed";
  parse_error: string | null;
  created_at: string;
  storage_path: string;
}

interface ExtractedRow {
  id: string;
  skill_id: string | null;
  raw_term: string;
  matched_by: string;
  confidence: number;
  evidence_snippet: string | null;
  section: string;
  mention_count: number;
  years_hint: number | null;
  level_hint: number | null;
  accepted: boolean | null;
  last_year: number | null;
  skills: { id: string; canonical_name: string } | null;
}

const STATUS_LABEL: Record<CvRow["status"], string> = {
  uploaded: "Enviado",
  parsing: "Lendo…",
  parsed: "Lido",
  failed: "Falhou",
};

function formatBytes(size: number) {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(size / 1024)} KB`;
}

function CvPage() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const runParse = useServerFn(parseCv);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const maxSize = (isAuthenticated ? 10 : 5) * 1024 * 1024;

  const cvsQuery = useQuery({
    queryKey: ["cvs", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cvs")
        .select("id, original_filename, mime_type, file_size, is_current, status, parse_error, created_at, storage_path")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CvRow[];
    },
  });

  const current = cvsQuery.data?.find((cv) => cv.is_current) ?? null;

  // Status em tempo real
  React.useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("cvs-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cvs", filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["cvs", user.id] });
          void queryClient.invalidateQueries({ queryKey: ["cv-extracted"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const upload = async (file: File) => {
    if (!user) return;
    if (file.type !== MIME_PDF && file.type !== MIME_DOCX) {
      toast.error("Envie um arquivo PDF ou DOCX.");
      return;
    }
    if (file.size > maxSize) {
      toast.error(`Arquivo acima do limite de ${formatBytes(maxSize)}.`);
      return;
    }

    setUploading(true);
    try {
      const cvId = crypto.randomUUID();
      const ext = file.type === MIME_PDF ? "pdf" : "docx";
      const path = `${user.id}/${cvId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("cvs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      await supabase.from("cvs").update({ is_current: false }).eq("user_id", user.id).eq("is_current", true);

      const { error: insertError } = await supabase.from("cvs").insert({
        id: cvId,
        user_id: user.id,
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        is_current: true,
        status: "uploaded",
        consent_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;

      await queryClient.invalidateQueries({ queryKey: ["cvs", user.id] });
      const result = await runParse({ data: { cvId } });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Leitura concluída: ${result.totalSkills} termos detectados.`);
      await queryClient.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const makeCurrent = useMutation({
    mutationFn: async (cvId: string) => {
      if (!user) return;
      await supabase.from("cvs").update({ is_current: false }).eq("user_id", user.id).eq("is_current", true);
      const { error } = await supabase.from("cvs").update({ is_current: true }).eq("id", cvId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Currículo atual atualizado.");
      void queryClient.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reparse = useMutation({
    mutationFn: async (cvId: string) => runParse({ data: { cvId } }),
    onSuccess: (result) => {
      if (!result.ok) toast.error(result.error);
      else toast.success("Leitura refeita.");
      void queryClient.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Currículo"
        title="Meu CV"
        subtitle="Envie o currículo, revise o que foi detectado e confirme suas skills."
      />

      <Blueprint className="flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p className="text-caption text-neutral-700">
          A leitura é <strong>automática e por palavra-chave</strong>, sem inteligência artificial
          generativa. Anos e níveis são <strong>estimativas</strong> calculadas a partir das datas e
          da frequência dos termos no texto. Por isso a revisão é obrigatória: só o que você aceitar
          entra no seu perfil.
        </p>
      </Blueprint>

      <Blueprint
        className={`flex flex-col items-center gap-3 border-dashed p-10 text-center ${
          dragging ? "bg-neutral-100" : ""
        }`}
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        <Upload className="size-6 text-neutral-700" aria-hidden />
        <div>
          <p className="label-h6 text-neutral-900">Arraste seu currículo aqui</p>
          <p className="text-caption text-neutral-700">
            PDF ou DOCX, até {formatBytes(maxSize)}
            {isAuthenticated ? "" : " (10 MB com conta criada)"}.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Enviando e lendo…
            </>
          ) : (
            "Escolher arquivo"
          )}
        </Button>
      </Blueprint>

      {cvsQuery.isLoading ? (
        <LoadingState rows={3} label="Carregando currículos" />
      ) : (cvsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="Nenhum currículo enviado"
          description="Envie um PDF ou DOCX para começar a análise de aderência."
        />
      ) : (
        <>
          <Blueprint className="p-0">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Enviado em</th>
                  <th>Tamanho</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cvsQuery.data?.map((cv) => (
                  <tr key={cv.id}>
                    <td className="flex items-center gap-2">
                      <FileText className="size-4 text-neutral-700" aria-hidden />
                      {cv.original_filename}
                      {cv.is_current ? <Badge variant="secondary">atual</Badge> : null}
                    </td>
                    <td className="num">{new Date(cv.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="num">{formatBytes(cv.file_size)}</td>
                    <td>
                      <span className="text-caption">
                        {STATUS_LABEL[cv.status]}
                        {cv.parse_error ? ` — ${cv.parse_error}` : ""}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        {!cv.is_current && isAuthenticated ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => makeCurrent.mutate(cv.id)}
                          >
                            Tornar atual
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => reparse.mutate(cv.id)}>
                          Reprocessar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Blueprint>

          {!isAuthenticated ? (
            <p className="text-caption text-neutral-700">
              Visitantes mantêm apenas 1 currículo e não têm histórico de versões. Crie sua conta
              para guardar versões anteriores.
            </p>
          ) : null}

          {current ? <ReviewPanel cv={current} /> : null}
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------- revisão do parse */

function ReviewPanel({ cv }: { cv: CvRow }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const extractedQuery = useQuery({
    queryKey: ["cv-extracted", cv.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cv_extracted_skills")
        .select(
          "id, skill_id, raw_term, matched_by, confidence, evidence_snippet, section, mention_count, years_hint, level_hint, accepted, last_year, skills ( id, canonical_name )",
        )
        .eq("cv_id", cv.id)
        .order("confidence", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExtractedRow[];
    },
  });

  const rows = extractedQuery.data ?? [];
  const matched = rows.filter((r) => r.matched_by !== "unmatched");
  const unmatched = rows.filter((r) => r.matched_by === "unmatched");

  const [levels, setLevels] = React.useState<Record<string, number>>({});
  const level = (row: ExtractedRow) => levels[row.id] ?? row.level_hint ?? 2;

  const accept = useMutation({
    mutationFn: async (items: ExtractedRow[]) => {
      if (!user) return;
      const payload = items
        .filter((r) => r.skill_id)
        .map((r) => ({
          user_id: user.id,
          skill_id: r.skill_id!,
          level: level(r),
          years: r.years_hint,
          source: "cv" as const,
          evidence: r.evidence_snippet,
          last_used_year: r.last_year,
        }));
      if (payload.length > 0) {
        const { error } = await supabase
          .from("user_skills")
          .upsert(payload, { onConflict: "user_id,skill_id" });
        if (error) throw error;
      }
      const { error: markError } = await supabase
        .from("cv_extracted_skills")
        .update({ accepted: true })
        .in(
          "id",
          items.map((r) => r.id),
        );
      if (markError) throw markError;
    },
    onSuccess: () => {
      toast.success("Skills adicionadas ao seu perfil.");
      void queryClient.invalidateQueries();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const discard = useMutation({
    mutationFn: async (items: ExtractedRow[]) => {
      const { error } = await supabase
        .from("cv_extracted_skills")
        .update({ accepted: false })
        .in(
          "id",
          items.map((r) => r.id),
        );
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cv-extracted", cv.id] }),
    onError: (err: Error) => toast.error(err.message),
  });

  if (cv.status === "parsing") return <LoadingState rows={4} label="Lendo o currículo" />;
  if (extractedQuery.isLoading) return <LoadingState rows={4} label="Carregando revisão" />;
  if (rows.length === 0)
    return (
      <EmptyState
        title="Nada para revisar ainda"
        description="Assim que a leitura terminar, os termos detectados aparecem aqui."
      />
    );

  const pending = matched.filter((r) => r.accepted === null);

  return (
    <Tabs defaultValue="detectadas" className="w-full">
      <TabsList>
        <TabsTrigger value="detectadas">Detectadas ({matched.length})</TabsTrigger>
        <TabsTrigger value="nao-mapeadas">Não mapeadas ({unmatched.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="detectadas" className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => accept.mutate(pending.filter((r) => r.confidence >= 0.95))}
            disabled={accept.isPending}
          >
            Aceitar todas com confiança alta
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => discard.mutate(pending.filter((r) => r.confidence < 0.9))}
            disabled={discard.isPending}
          >
            Descartar todas de baixa confiança
          </Button>
        </div>

        {matched.map((row) => (
          <Blueprint key={row.id} className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-h6 text-neutral-900">
                {row.skills?.canonical_name ?? row.raw_term}
              </span>
              <Badge variant="outline">{row.matched_by}</Badge>
              <span className="num text-caption text-neutral-700">
                confiança {Math.round(row.confidence * 100)}%
              </span>
              <span className="num text-caption text-neutral-700">
                {row.years_hint !== null ? `${row.years_hint} ano(s) estimado(s)` : "anos não estimados"}
              </span>
              <span className="text-caption text-neutral-700">seção: {row.section}</span>
              {row.accepted === true ? (
                <Badge variant="secondary">
                  <CheckCircle2 className="mr-1 size-3" aria-hidden /> aceita
                </Badge>
              ) : null}
              {row.accepted === false ? <Badge variant="outline">descartada</Badge> : null}
            </div>

            {row.evidence_snippet ? (
              <p className="border-l-2 border-neutral-300 pl-3 text-caption text-neutral-700">
                “{row.evidence_snippet}”
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-neutral-700">Nível sugerido:</span>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={level(row) === n ? "default" : "outline"}
                  onClick={() => setLevels((prev) => ({ ...prev, [row.id]: n }))}
                >
                  {n}
                </Button>
              ))}
              <Button size="sm" onClick={() => accept.mutate([row])} disabled={accept.isPending}>
                Aceitar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => discard.mutate([row])}
                disabled={discard.isPending}
              >
                Descartar
              </Button>
            </div>
          </Blueprint>
        ))}
      </TabsContent>

      <TabsContent value="nao-mapeadas" className="mt-4 flex flex-col gap-3">
        {unmatched.length === 0 ? (
          <EmptyState title="Nenhum termo desconhecido" description="Tudo foi mapeado no catálogo." />
        ) : (
          unmatched.map((row) => <UnmatchedRow key={row.id} row={row} cvId={cv.id} />)
        )}
      </TabsContent>
    </Tabs>
  );
}

function UnmatchedRow({ row, cvId }: { row: ExtractedRow; cvId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [term, setTerm] = React.useState(row.raw_term);

  const search = useQuery({
    queryKey: ["skill-search", term],
    enabled: term.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("skills")
        .select("id, canonical_name")
        .ilike("canonical_name", `%${term.trim()}%`)
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  const link = useMutation({
    mutationFn: async (skillId: string) => {
      if (!user) return;
      const { error } = await supabase.from("user_skills").upsert(
        {
          user_id: user.id,
          skill_id: skillId,
          level: 2,
          source: "cv" as const,
          evidence: row.evidence_snippet,
        },
        { onConflict: "user_id,skill_id" },
      );
      if (error) throw error;
      await supabase.from("cv_extracted_skills").update({ accepted: true }).eq("id", row.id);
    },
    onSuccess: () => {
      toast.success("Skill vinculada ao seu perfil.");
      void queryClient.invalidateQueries({ queryKey: ["cv-extracted", cvId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const suggest = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("pending_skill_terms").insert({
        term: row.raw_term,
        suggested_by: user.id,
        context: row.evidence_snippet,
      });
      if (error) throw error;
      await supabase.from("cv_extracted_skills").update({ accepted: false }).eq("id", row.id);
    },
    onSuccess: () => {
      toast.success("Sugestão enviada para curadoria.");
      void queryClient.invalidateQueries({ queryKey: ["cv-extracted", cvId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Blueprint className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-h6 text-neutral-900">{row.raw_term}</span>
        <Badge variant="outline">não mapeado</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar no catálogo"
          className="max-w-xs"
        />
        <Button size="sm" variant="outline" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
          Sugerir nova skill
        </Button>
      </div>
      {(search.data?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-neutral-700">É isto que você quis dizer?</span>
          {search.data?.map((s) => (
            <Button key={s.id} size="sm" variant="outline" onClick={() => link.mutate(s.id)}>
              {s.canonical_name}
            </Button>
          ))}
        </div>
      ) : null}
    </Blueprint>
  );
}
