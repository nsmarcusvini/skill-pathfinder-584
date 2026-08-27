import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ExternalLink, Plus, AlertTriangle, Award, CheckCircle2, BookOpen, Clock,
  Pencil, Trash2,
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
  getCertsCatalog, getUserCerts, upsertUserCert, deleteUserCert,
  addLearningItemToStudyPlan,
  type CertCatalogItem, type UserCert, type CertStatus, type CertDifficulty,
} from "@/lib/learning.functions";
import { getStudyPlans } from "@/lib/study.functions";

export const Route = createFileRoute("/_conta/certificacoes")({
  head: () => ({
    meta: [
      { title: "Certificações — RUMVIA" },
      { name: "description", content: "Catálogo de certificações filtrado pela sua trilha, com impacto no seu gap." },
    ],
  }),
  component: CertificacoesPage,
});

const DIFFICULTY_LABEL: Record<CertDifficulty, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
  especialista: "Especialista",
};

const STATUS_LABEL: Record<CertStatus, string> = {
  planejada: "Planejada",
  estudando: "Estudando",
  obtida: "Obtida",
  expirada: "Expirada",
};

const STATUS_COLOR: Record<CertStatus, string> = {
  planejada: "var(--color-muted-foreground, #888)",
  estudando: "var(--color-warning)",
  obtida: "var(--color-success)",
  expirada: "var(--color-danger)",
};

function CertCard({
  cert,
  missingSkills,
  onAddToUser,
  onAddToPlan,
}: {
  cert: CertCatalogItem;
  missingSkills: Set<string>;
  onAddToUser: (cert: CertCatalogItem) => void;
  onAddToPlan: (cert: CertCatalogItem) => void;
}) {
  const lacunas = cert.skillIds.filter((s) => missingSkills.has(s)).length;
  return (
    <div className="border p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-sm">{cert.name}</span>
          <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
            {cert.issuer}{cert.level ? ` · ${cert.level}` : ""}
          </span>
        </div>
        {cert.userStatus && (
          <span className="text-xs font-semibold shrink-0" style={{ color: STATUS_COLOR[cert.userStatus] }}>
            {STATUS_LABEL[cert.userStatus]}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {cert.difficulty && (
          <Badge variant="outline" className="text-xs">{DIFFICULTY_LABEL[cert.difficulty]}</Badge>
        )}
        {cert.costUsd !== null && (
          <Badge variant="outline" className="text-xs">
            {cert.costUsd === 0 ? "Gratuita" : `US$ ${cert.costUsd}`}
          </Badge>
        )}
        {cert.validityMonths ? (
          <Badge variant="outline" className="text-xs">{cert.validityMonths}m validade</Badge>
        ) : cert.validityMonths === 0 ? null : null}
        {cert.examDurationMin ? (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Clock size={9} />{cert.examDurationMin}min
          </Badge>
        ) : null}
        {lacunas > 0 && (
          <Badge className="text-xs" style={{ background: "var(--color-warning)", color: "#fff" }}>
            {lacunas} lacuna{lacunas !== 1 ? "s" : ""} resolvida{lacunas !== 1 ? "s" : ""}
          </Badge>
        )}
        {cert.expiringAlert && (
          <Badge className="text-xs flex items-center gap-1" style={{ background: "var(--color-danger)", color: "#fff" }}>
            <AlertTriangle size={9} /> Expira em breve
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2 mt-1">
        {cert.officialUrl && (
          <a
            href={cert.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs flex items-center gap-1"
            style={{ color: "var(--color-accent-600, #416180)" }}
          >
            <ExternalLink size={10} /> Site oficial
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => onAddToPlan(cert)}>
            + Plano
          </Button>
          <Button size="sm" className="h-6 text-xs" onClick={() => onAddToUser(cert)}>
            {cert.userStatus ? "Atualizar" : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CertificacoesPage() {
  const { trackId } = useMarket();
  const { isAnonymous } = useAuth();
  const { data: gapData } = useGap();
  const qc = useQueryClient();

  const [filterDifficulty, setFilterDifficulty] = React.useState<string>("todas");
  const [editTarget, setEditTarget] = React.useState<CertCatalogItem | null>(null);
  const [customName, setCustomName] = React.useState("");
  const [editStatus, setEditStatus] = React.useState<CertStatus>("planejada");
  const [editObtained, setEditObtained] = React.useState("");
  const [editExpires, setEditExpires] = React.useState("");
  const [editCredUrl, setEditCredUrl] = React.useState("");
  const [editCredId, setEditCredId] = React.useState("");
  const [showCustom, setShowCustom] = React.useState(false);
  const [planTarget, setPlanTarget] = React.useState<CertCatalogItem | null>(null);
  const [selectedPlanId, setSelectedPlanId] = React.useState<string>("");

  const getCatalogRun = useServerFn(getCertsCatalog);
  const getUserCertsRun = useServerFn(getUserCerts);
  const upsertRun = useServerFn(upsertUserCert);
  const deleteRun = useServerFn(deleteUserCert);
  const getPlansRun = useServerFn(getStudyPlans);
  const addToPlanRun = useServerFn(addLearningItemToStudyPlan);

  const catalogQuery = useQuery({
    queryKey: ["certs_catalog", trackId],
    enabled: !!trackId,
    staleTime: 10 * 60 * 1000,
    queryFn: () => getCatalogRun({ data: { trackId: trackId! } }),
  });

  const userCertsQuery = useQuery({
    queryKey: ["user_certs"],
    enabled: !isAnonymous,
    queryFn: () => getUserCertsRun({ data: {} }),
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
          ...(editTarget?.id && { certId: editTarget.id }),
          ...(customName ? { customName } : {}),
          status: editStatus,
          ...(editObtained ? { obtainedAt: editObtained } : {}),
          ...(editExpires ? { expiresAt: editExpires } : {}),
          ...(editCredUrl ? { credentialUrl: editCredUrl } : {}),
          ...(editCredId ? { credentialId: editCredId } : {}),
          ...(editTarget?.userCertId ? { existingId: editTarget.userCertId } : {}),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_certs"] });
      qc.invalidateQueries({ queryKey: ["certs_catalog"] });
      setEditTarget(null);
      toast.success("Certificação salva!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRun({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_certs"] });
      qc.invalidateQueries({ queryKey: ["certs_catalog"] });
      toast.success("Certificação removida.");
    },
  });

  const addToPlanMutation = useMutation({
    mutationFn: () =>
      addToPlanRun({
        data: {
          planId: selectedPlanId,
          title: planTarget!.name,
          type: "certificacao",
          ...(planTarget!.officialUrl ? { resourceUrl: planTarget!.officialUrl } : {}),
        },
      }),
    onSuccess: () => {
      setPlanTarget(null);
      toast.success("Adicionado ao plano de estudos!");
    },
  });

  const catalog = catalogQuery.data ?? [];
  const filtered = catalog.filter(
    (c) => filterDifficulty === "todas" || c.difficulty === filterDifficulty,
  );
  // Sort by gap impact (lacunas resolvidas) descending
  const sorted = [...filtered].sort(
    (a, b) =>
      b.skillIds.filter((s) => missingSkills.has(s)).length -
      a.skillIds.filter((s) => missingSkills.has(s)).length,
  );

  function openEdit(cert: CertCatalogItem) {
    setEditTarget(cert);
    setEditStatus(cert.userStatus ?? "planejada");
    setEditObtained("");
    setEditExpires("");
    setEditCredUrl("");
    setEditCredId("");
    setCustomName("");
  }

  if (!trackId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Aprendizado" title="Certificações" />
        <EmptyState title="Selecione uma trilha" description="Escolha sua trilha para ver o catálogo." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Aprendizado"
        title="Certificações"
        subtitle="Catálogo ordenado pelo impacto nas suas lacunas de gap."
      />

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="minhas">Minhas certificações</TabsTrigger>
        </TabsList>

        {/* Catálogo */}
        <TabsContent value="catalogo" className="flex flex-col gap-4 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue placeholder="Dificuldade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as dificuldades</SelectItem>
                {(["iniciante", "intermediario", "avancado", "especialista"] as CertDifficulty[]).map((d) => (
                  <SelectItem key={d} value={d}>{DIFFICULTY_LABEL[d]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs ml-auto" style={{ color: "var(--color-muted-foreground, #888)" }}>
              {sorted.length} certificaç{sorted.length === 1 ? "ão" : "ões"}
            </span>
          </div>

          {catalogQuery.isLoading && <LoadingState />}
          {catalogQuery.isSuccess && sorted.length === 0 && (
            <EmptyState title="Nenhuma certificação" description="Sem itens para este filtro." />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map((cert) => (
              <CertCard
                key={cert.id}
                cert={cert}
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

        {/* Minhas certificações */}
        <TabsContent value="minhas" className="flex flex-col gap-4 mt-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              {userCertsQuery.data?.length ?? 0} certificaç{userCertsQuery.data?.length === 1 ? "ão" : "ões"}
            </span>
            <Button size="sm" variant="outline" onClick={() => setShowCustom(true)}>
              <Plus size={13} className="mr-1" /> Adicionar custom
            </Button>
          </div>

          {isAnonymous && (
            <EmptyState title="Conta permanente necessária" description="Crie uma conta para registrar suas certificações." />
          )}

          {!isAnonymous && userCertsQuery.isLoading && <LoadingState />}
          {!isAnonymous && userCertsQuery.isSuccess && (userCertsQuery.data ?? []).length === 0 && (
            <EmptyState title="Nenhuma certificação" description="Adicione certificações do catálogo ou registre uma custom." />
          )}

          <div className="flex flex-col gap-3">
            {(userCertsQuery.data ?? []).map((uc) => (
              <Blueprint key={uc.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Award size={14} style={{ color: STATUS_COLOR[uc.status] }} />
                      <span className="font-semibold text-sm">{uc.name}</span>
                    </div>
                    {uc.issuer && (
                      <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>{uc.issuer}</span>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1 text-xs">
                      <span style={{ color: STATUS_COLOR[uc.status] }}>{STATUS_LABEL[uc.status]}</span>
                      {uc.obtainedAt && <span>Obtida: {uc.obtainedAt}</span>}
                      {uc.expiresAt && (
                        <span style={{ color: uc.expiringAlert ? "var(--color-danger)" : "inherit" }}>
                          {uc.expiringAlert && <AlertTriangle size={10} className="inline mr-0.5" />}
                          Expira: {uc.expiresAt}
                        </span>
                      )}
                      {uc.credentialUrl && (
                        <a href={uc.credentialUrl} target="_blank" rel="noopener noreferrer"
                           className="flex items-center gap-0.5" style={{ color: "var(--color-accent-600, #416180)" }}>
                          <ExternalLink size={9} /> Credencial
                        </a>
                      )}
                    </div>
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

      {/* Edit / add to user dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget?.userStatus ? "Atualizar" : "Adicionar"}: {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as CertStatus)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as CertStatus[]).map((s) => (
                    <SelectItem key={s} value={s} className="text-sm">{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editStatus === "obtida" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Data de obtenção</Label>
                  <Input type="date" className="h-8 text-sm" value={editObtained} onChange={(e) => setEditObtained(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Expira em</Label>
                  <Input type="date" className="h-8 text-sm" value={editExpires} onChange={(e) => setEditExpires(e.target.value)} />
                </div>
              </div>
            )}
            {editStatus === "obtida" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">URL da credencial</Label>
                  <Input className="h-8 text-sm" value={editCredUrl} onChange={(e) => setEditCredUrl(e.target.value)} placeholder="https://…" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">ID da credencial</Label>
                  <Input className="h-8 text-sm" value={editCredId} onChange={(e) => setEditCredId(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom cert dialog */}
      <Dialog open={showCustom} onOpenChange={setShowCustom}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar certificação custom</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Nome da certificação</Label>
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="ex: ISO 27001 Lead Implementer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCustom(false)}>Cancelar</Button>
            <Button
              disabled={!customName.trim() || upsertMutation.isPending}
              onClick={() => {
                upsertRun({ data: { customName, status: "planejada" } })
                  .then(() => {
                    qc.invalidateQueries({ queryKey: ["user_certs"] });
                    setShowCustom(false);
                    setCustomName("");
                    toast.success("Certificação adicionada!");
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
            <p className="text-sm">{planTarget?.name}</p>
            {(plansQuery.data ?? []).length === 0 ? (
              <p className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                Nenhum plano de estudos ativo. Crie um na aba Progresso primeiro.
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
            <Button
              disabled={!selectedPlanId || addToPlanMutation.isPending}
              onClick={() => addToPlanMutation.mutate()}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
