import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ExternalLink, Plus, Star, Clock, Trash2, BookOpen, Monitor, Layers,
} from "lucide-react";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState, LoadingState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarket } from "@/hooks/use-market";
import { useAuth } from "@/hooks/use-auth";
import { useGap } from "@/hooks/use-gap";
import {
  getCoursesCatalog, getUserCourses, upsertUserCourse, deleteUserCourse,
  addLearningItemToStudyPlan,
  type CourseCatalogItem, type UserCourse, type CourseStatus,
  type CourseFormat, type CoursePriceType,
} from "@/lib/learning.functions";
import { getStudyPlans } from "@/lib/study.functions";

export const Route = createFileRoute("/_conta/cursos")({
  head: () => ({
    meta: [
      { title: "Cursos — RUMVIA" },
      { name: "description", content: "Catálogo de cursos filtrado pela sua trilha, com impacto no seu gap." },
    ],
  }),
  component: CursosPage,
});

const FORMAT_LABEL: Record<CourseFormat, string> = {
  video: "Vídeo",
  hands_on: "Hands-on",
  livro: "Livro",
  doc: "Documentação",
};

const PRICE_LABEL: Record<CoursePriceType, string> = {
  gratuito: "Gratuito",
  pago: "Pago",
  assinatura: "Assinatura",
};

const STATUS_LABEL: Record<CourseStatus, string> = {
  planejado: "Planejado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

const STATUS_COLOR: Record<CourseStatus, string> = {
  planejado: "var(--color-muted-foreground, #888)",
  em_andamento: "var(--color-warning)",
  concluido: "var(--color-success)",
};

function CourseCard({
  course,
  missingSkills,
  onAddToUser,
  onAddToPlan,
}: {
  course: CourseCatalogItem;
  missingSkills: Set<string>;
  onAddToUser: (c: CourseCatalogItem) => void;
  onAddToPlan: (c: CourseCatalogItem) => void;
}) {
  const lacunas = course.skillIds.filter((s) => missingSkills.has(s)).length;
  return (
    <div className="border p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-sm">{course.title}</span>
          <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
            {course.provider}
          </span>
        </div>
        {course.userStatus && (
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-xs font-semibold" style={{ color: STATUS_COLOR[course.userStatus] }}>
              {STATUS_LABEL[course.userStatus]}
            </span>
            {course.progressPercent > 0 && (
              <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                {course.progressPercent}%
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {course.format && (
          <Badge variant="outline" className="text-xs">{FORMAT_LABEL[course.format]}</Badge>
        )}
        {course.priceType && (
          <Badge
            variant="outline"
            className="text-xs"
            style={{
              borderColor: course.priceType === "gratuito" ? "var(--color-success)" : undefined,
              color: course.priceType === "gratuito" ? "var(--color-success)" : undefined,
            }}
          >
            {PRICE_LABEL[course.priceType]}
          </Badge>
        )}
        {course.durationHours && (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Clock size={9} />{course.durationHours}h
          </Badge>
        )}
        {course.language === "pt" && (
          <Badge variant="outline" className="text-xs">PT 🇧🇷</Badge>
        )}
        {course.rating && (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Star size={9} />{course.rating}
          </Badge>
        )}
        {lacunas > 0 && (
          <Badge className="text-xs" style={{ background: "var(--color-warning)", color: "#fff" }}>
            {lacunas} lacuna{lacunas !== 1 ? "s" : ""} resolvida{lacunas !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2 mt-1">
        {course.url && (
          <a
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs flex items-center gap-1"
            style={{ color: "var(--color-accent-600, #416180)" }}
          >
            <ExternalLink size={10} /> Acessar
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => onAddToPlan(course)}>
            + Plano
          </Button>
          <Button size="sm" className="h-6 text-xs" onClick={() => onAddToUser(course)}>
            {course.userStatus ? "Atualizar" : "Matricular"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CursosPage() {
  const { trackId } = useMarket();
  const { isAnonymous } = useAuth();
  const { data: gapData } = useGap();
  const qc = useQueryClient();

  const [filterFormat, setFilterFormat] = React.useState<string>("todos");
  const [filterPrice, setFilterPrice] = React.useState<string>("todos");
  const [filterLang, setFilterLang] = React.useState<string>("todos");
  const [editTarget, setEditTarget] = React.useState<CourseCatalogItem | null>(null);
  const [editStatus, setEditStatus] = React.useState<CourseStatus>("planejado");
  const [editProgress, setEditProgress] = React.useState("0");
  const [editCertUrl, setEditCertUrl] = React.useState("");
  const [showCustom, setShowCustom] = React.useState(false);
  const [customTitle, setCustomTitle] = React.useState("");
  const [planTarget, setPlanTarget] = React.useState<CourseCatalogItem | null>(null);
  const [selectedPlanId, setSelectedPlanId] = React.useState<string>("");

  const getCatalogRun = useServerFn(getCoursesCatalog);
  const getUserCoursesRun = useServerFn(getUserCourses);
  const upsertRun = useServerFn(upsertUserCourse);
  const deleteRun = useServerFn(deleteUserCourse);
  const getPlansRun = useServerFn(getStudyPlans);
  const addToPlanRun = useServerFn(addLearningItemToStudyPlan);

  const catalogQuery = useQuery({
    queryKey: ["courses_catalog", trackId],
    enabled: !!trackId,
    staleTime: 10 * 60 * 1000,
    queryFn: () => getCatalogRun({ data: { trackId: trackId! } }),
  });

  const userCoursesQuery = useQuery({
    queryKey: ["user_courses"],
    enabled: !isAnonymous,
    queryFn: () => getUserCoursesRun({ data: {} }),
  });

  const plansQuery = useQuery({
    queryKey: ["study_plans"],
    enabled: !isAnonymous,
    queryFn: () => getPlansRun({ data: {} }),
  });

  const missingSkills = new Set(
    (gapData?.items ?? []).filter((i) => i.status === "faltante").map((i) => i.skillId),
  );

  const upsertMutation = useMutation({
    mutationFn: () =>
      upsertRun({
        data: {
          ...(editTarget?.id ? { courseId: editTarget.id } : {}),
          status: editStatus,
          progressPercent: Number(editProgress),
          ...(editCertUrl ? { certificateUrl: editCertUrl } : {}),
          ...(editTarget?.userCourseId ? { existingId: editTarget.userCourseId } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_courses"] });
      qc.invalidateQueries({ queryKey: ["courses_catalog"] });
      setEditTarget(null);
      toast.success("Curso salvo!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRun({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_courses"] });
      qc.invalidateQueries({ queryKey: ["courses_catalog"] });
      toast.success("Curso removido.");
    },
  });

  const addToPlanMutation = useMutation({
    mutationFn: () =>
      addToPlanRun({
        data: {
          planId: selectedPlanId,
          title: planTarget!.title,
          type: "curso",
          ...(planTarget!.url ? { resourceUrl: planTarget!.url } : {}),
        },
      }),
    onSuccess: () => {
      setPlanTarget(null);
      toast.success("Adicionado ao plano de estudos!");
    },
  });

  const catalog = catalogQuery.data ?? [];
  const filtered = catalog.filter((c) => {
    if (filterFormat !== "todos" && c.format !== filterFormat) return false;
    if (filterPrice !== "todos" && c.priceType !== filterPrice) return false;
    if (filterLang === "pt" && c.language !== "pt") return false;
    return true;
  });
  const sorted = [...filtered].sort(
    (a, b) =>
      b.skillIds.filter((s) => missingSkills.has(s)).length -
      a.skillIds.filter((s) => missingSkills.has(s)).length,
  );

  function openEdit(course: CourseCatalogItem) {
    setEditTarget(course);
    setEditStatus(course.userStatus ?? "planejado");
    setEditProgress(String(course.progressPercent));
    setEditCertUrl("");
  }

  if (!trackId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Aprendizado" title="Cursos" />
        <EmptyState title="Selecione uma trilha" description="Escolha sua trilha para ver o catálogo." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Aprendizado"
        title="Cursos"
        subtitle="Catálogo ordenado pelo impacto nas suas lacunas de gap."
      />

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="meus">Meus cursos</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo" className="flex flex-col gap-4 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filterFormat} onValueChange={setFilterFormat}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Formato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os formatos</SelectItem>
                {(["video", "hands_on", "livro", "doc"] as CourseFormat[]).map((f) => (
                  <SelectItem key={f} value={f}>{FORMAT_LABEL[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPrice} onValueChange={setFilterPrice}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Preço" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Qualquer preço</SelectItem>
                {(["gratuito", "pago", "assinatura"] as CoursePriceType[]).map((p) => (
                  <SelectItem key={p} value={p}>{PRICE_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterLang} onValueChange={setFilterLang}>
              <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos idiomas</SelectItem>
                <SelectItem value="pt">🇧🇷 PT</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs ml-auto" style={{ color: "var(--color-muted-foreground, #888)" }}>
              {sorted.length} curso{sorted.length !== 1 ? "s" : ""}
            </span>
          </div>

          {catalogQuery.isLoading && <LoadingState />}
          {catalogQuery.isSuccess && sorted.length === 0 && (
            <EmptyState title="Nenhum curso" description="Sem itens para este filtro." />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                missingSkills={missingSkills}
                onAddToUser={openEdit}
                onAddToPlan={(c) => {
                  setPlanTarget(c);
                  setSelectedPlanId(plansQuery.data?.[0]?.id ?? "");
                }}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="meus" className="flex flex-col gap-4 mt-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              {userCoursesQuery.data?.length ?? 0} curso{userCoursesQuery.data?.length !== 1 ? "s" : ""}
            </span>
            <Button size="sm" variant="outline" onClick={() => setShowCustom(true)}>
              <Plus size={13} className="mr-1" /> Adicionar custom
            </Button>
          </div>

          {isAnonymous && (
            <EmptyState title="Conta permanente necessária" description="Crie uma conta para registrar seus cursos." />
          )}
          {!isAnonymous && userCoursesQuery.isLoading && <LoadingState />}
          {!isAnonymous && userCoursesQuery.isSuccess && (userCoursesQuery.data ?? []).length === 0 && (
            <EmptyState title="Nenhum curso" description="Matricule-se em cursos do catálogo ou adicione um custom." />
          )}

          <div className="flex flex-col gap-3">
            {(userCoursesQuery.data ?? []).map((uc) => (
              <Blueprint key={uc.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm">{uc.title}</span>
                    {uc.provider && (
                      <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>{uc.provider}</span>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1 text-xs">
                      <span style={{ color: STATUS_COLOR[uc.status] }}>{STATUS_LABEL[uc.status]}</span>
                      {uc.progressPercent > 0 && <span>{uc.progressPercent}%</span>}
                      {uc.completedAt && <span>Concluído: {uc.completedAt}</span>}
                      {uc.certificateUrl && (
                        <a href={uc.certificateUrl} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-0.5" style={{ color: "var(--color-accent-600, #416180)" }}>
                          <ExternalLink size={9} /> Certificado
                        </a>
                      )}
                    </div>
                    {uc.progressPercent > 0 && (
                      <div className="w-full h-1 mt-1" style={{ background: "var(--color-border)" }}>
                        <div style={{ width: `${uc.progressPercent}%`, height: "100%", background: "var(--color-accent-600, #416180)" }} />
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteMutation.mutate(uc.id)} className="opacity-40 hover:opacity-100 shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              </Blueprint>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget?.userStatus ? "Atualizar" : "Matricular-se"}: {editTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as CourseStatus)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as CourseStatus[]).map((s) => (
                    <SelectItem key={s} value={s} className="text-sm">{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Progresso (%)</Label>
              <Input
                className="h-8 text-sm"
                value={editProgress}
                onChange={(e) => setEditProgress(e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </div>
            {editStatus === "concluido" && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs">URL do certificado</Label>
                <Input className="h-8 text-sm" value={editCertUrl} onChange={(e) => setEditCertUrl(e.target.value)} placeholder="https://…" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom course dialog */}
      <Dialog open={showCustom} onOpenChange={setShowCustom}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar curso custom</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Título do curso</Label>
              <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="ex: Rust Programming Language" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCustom(false)}>Cancelar</Button>
            <Button
              disabled={!customTitle.trim()}
              onClick={() => {
                upsertRun({ data: { customTitle, status: "planejado" } })
                  .then(() => {
                    qc.invalidateQueries({ queryKey: ["user_courses"] });
                    setShowCustom(false);
                    setCustomTitle("");
                    toast.success("Curso adicionado!");
                  })
                  .catch(() => toast.error("Erro ao adicionar."));
              }}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to plan dialog */}
      <Dialog open={!!planTarget} onOpenChange={(open) => { if (!open) setPlanTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar ao plano de estudos</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm">{planTarget?.title}</p>
            {(plansQuery.data ?? []).length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                Nenhum plano ativo. Crie um na aba Progresso.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Plano</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(plansQuery.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-sm">{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanTarget(null)}>Cancelar</Button>
            <Button disabled={!selectedPlanId || addToPlanMutation.isPending} onClick={() => addToPlanMutation.mutate()}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
