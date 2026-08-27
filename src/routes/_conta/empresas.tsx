import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bell, BellOff, ExternalLink, Globe, MapPin } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { ChartCard } from "@/components/rumvia/chart-card";
import { SkillBadge, type SkillStatus } from "@/components/rumvia/skill-badge";
import { EmptyState, LoadingState, ErrorState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERIOD_LABEL,
  PERIOD_OPTIONS,
  SEGMENT_LABEL,
  SENIORITY_LABEL,
  SENIORITIES,
  useMarket,
  type MarketSegment,
  type Seniority,
} from "@/hooks/use-market";
import { useGap } from "@/hooks/use-gap";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  getCompanyRanking,
  getCompanyDetail,
  getCompanyMonthly,
  type CompanyRankingItem,
} from "@/lib/market.functions";

export const Route = createFileRoute("/_conta/empresas")({
  head: () => ({
    meta: [
      { title: "Empresas — RUMVIA" },
      {
        name: "description",
        content: "Empresas que mais contratam na sua trilha e segmento de mercado.",
      },
      { property: "og:title", content: "Empresas — RUMVIA" },
      { property: "og:description", content: "Quem está contratando na sua trilha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmpresasPage,
});

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function EmpresasPage() {
  const { track, trackId, segment, setSegment, seniority, setSeniority, periodDays, setPeriodDays } =
    useMarket();
  const { user } = useAuth();
  const gap = useGap();
  const queryClient = useQueryClient();

  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string | null>(null);
  const [selectedCompanyName, setSelectedCompanyName] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState<"jobs" | "recent">("jobs");

  const runRanking = useServerFn(getCompanyRanking);
  const runDetail = useServerFn(getCompanyDetail);
  const runMonthly = useServerFn(getCompanyMonthly);

  // ── Gap status map ────────────────────────────────────────────────────────
  const gapStatusBySkill = React.useMemo(() => {
    const map = new Map<string, SkillStatus>();
    for (const item of gap.data?.items ?? []) {
      map.set(item.skillId, item.status);
    }
    return map;
  }, [gap.data]);

  // ── Company ranking ───────────────────────────────────────────────────────
  const rankingQuery = useQuery({
    queryKey: ["companies", trackId, segment, seniority, periodDays],
    enabled: Boolean(trackId),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      runRanking({
        data: {
          trackId: trackId!,
          segments: [segment],
          seniorities: [seniority],
          periodDays,
        },
      }),
  });

  const sortedCompanies = React.useMemo(() => {
    const companies = rankingQuery.data ?? [];
    if (sortBy === "recent") {
      return [...companies].sort((a, b) => {
        if (!a.lastPostedAt) return 1;
        if (!b.lastPostedAt) return -1;
        return b.lastPostedAt.localeCompare(a.lastPostedAt);
      });
    }
    return companies;
  }, [rankingQuery.data, sortBy]);

  // ── Followed companies (client query — RLS garante isolamento) ────────────
  const followedQuery = useQuery({
    queryKey: ["followed-companies", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_followed_companies")
        .select("company_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.company_id));
    },
  });

  const followedSet = followedQuery.data ?? new Set<string>();

  // ── Follow / unfollow ─────────────────────────────────────────────────────
  const toggleFollow = useMutation({
    mutationFn: async ({ companyId, follow }: { companyId: string; follow: boolean }) => {
      if (!user) return;
      if (follow) {
        const { error } = await supabase
          .from("user_followed_companies")
          .upsert({ user_id: user.id, company_id: companyId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_followed_companies")
          .delete()
          .eq("user_id", user.id)
          .eq("company_id", companyId);
        if (error) throw error;
      }
    },
    onSuccess: (_, { companyId, follow }) => {
      void queryClient.invalidateQueries({ queryKey: ["followed-companies"] });
      toast.success(follow ? "Empresa seguida." : "Deixou de seguir a empresa.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Company detail ────────────────────────────────────────────────────────
  const detailQuery = useQuery({
    queryKey: ["company-detail", selectedCompanyId, trackId, segment, periodDays],
    enabled: Boolean(selectedCompanyId) && Boolean(trackId),
    queryFn: () =>
      runDetail({
        data: {
          trackId: trackId!,
          companyId: selectedCompanyId!,
          segments: [segment],
          periodDays,
        },
      }),
  });

  const monthlyQuery = useQuery({
    queryKey: ["company-monthly", selectedCompanyId, trackId, segment],
    enabled: Boolean(selectedCompanyId) && Boolean(trackId),
    queryFn: () =>
      runMonthly({
        data: {
          trackId: trackId!,
          companyId: selectedCompanyId!,
          segments: [segment],
          months: 6,
        },
      }),
  });

  function openCompany(company: CompanyRankingItem) {
    setSelectedCompanyId(company.companyId);
    setSelectedCompanyName(company.name);
  }

  const isLoading = rankingQuery.isLoading;
  const isError = rankingQuery.isError;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Mercado"
        title="Empresas"
        subtitle={`${track?.name ?? "Trilha"} · ${SEGMENT_LABEL[segment]} · ${SENIORITY_LABEL[seniority]}`}
      />

      {/* Filtros */}
      <Blueprint className="flex flex-wrap items-center gap-3 p-3">
        <span className="caption">Filtros</span>
        <Select value={seniority} onValueChange={(v) => void setSeniority(v as Seniority)}>
          <SelectTrigger className="w-[160px]" aria-label="Senioridade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SENIORITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {SENIORITY_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={segment} onValueChange={(v) => void setSegment(v as MarketSegment)}>
          <SelectTrigger className="w-[200px]" aria-label="Segmento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="br">{SEGMENT_LABEL.br}</SelectItem>
            <SelectItem value="remoto_global">{SEGMENT_LABEL.remoto_global}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
          <SelectTrigger className="w-[190px]" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {PERIOD_LABEL[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as "jobs" | "recent")}>
          <SelectTrigger className="w-[160px]" aria-label="Ordenar por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="jobs">Mais vagas</SelectItem>
            <SelectItem value="recent">Mais recentes</SelectItem>
          </SelectContent>
        </Select>
      </Blueprint>

      {/* States */}
      {!trackId ? (
        <EmptyState
          title="Trilha não selecionada"
          description="Escolha uma trilha no menu superior para ver as empresas contratando."
        />
      ) : isLoading ? (
        <LoadingState rows={6} label="Carregando empresas" />
      ) : isError ? (
        <ErrorState onRetry={() => void rankingQuery.refetch()} />
      ) : sortedCompanies.length === 0 ? (
        <EmptyState
          title="Sem empresas neste recorte"
          description="Tente ampliar o período ou mudar o segmento de mercado."
        />
      ) : (
        <Blueprint className="flex flex-col">
          <div className="border-b border-divider p-3">
            <h6 className="text-neutral-700">
              {sortedCompanies.length} empresa{sortedCompanies.length !== 1 ? "s" : ""} contratando
            </h6>
            <p className="caption mt-1">{SEGMENT_LABEL[segment]} · {PERIOD_LABEL[periodDays]}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th className="text-right">Vagas</th>
                  <th>Última vaga</th>
                  <th>Faixa salarial</th>
                  <th>Segmentos</th>
                  <th>Top skills</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedCompanies.map((company) => {
                  const isFollowed = followedSet.has(company.companyId);
                  return (
                    <tr key={company.companyId}>
                      <td>
                        <div className="flex items-center gap-2">
                          {company.logoUrl ? (
                            <img
                              src={company.logoUrl}
                              alt={company.name}
                              className="size-7 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="size-7 bg-neutral-200" aria-hidden />
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{company.name}</span>
                            {company.industry ? (
                              <span className="caption text-neutral-600">{company.industry}</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="num text-right">{company.jobs}</td>
                      <td className="num">{formatDate(company.lastPostedAt)}</td>
                      <td className="num">
                        {company.avgSalaryMin !== null && company.avgSalaryMax !== null ? (
                          <span>
                            {formatCurrency(company.avgSalaryMin, company.currency)}
                            {" – "}
                            {formatCurrency(company.avgSalaryMax, company.currency)}
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {company.segments.includes("br") ? (
                            <Badge variant="outline" title="Brasil">
                              <MapPin className="mr-1 size-3" aria-hidden />
                              BR
                            </Badge>
                          ) : null}
                          {company.segments.includes("remoto_global") ? (
                            <Badge variant="outline" title="Remoto global">
                              <Globe className="mr-1 size-3" aria-hidden />
                              Global
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {company.topSkills.slice(0, 3).map((s) => {
                            const st = gapStatusBySkill.get(s.skillId) as SkillStatus | undefined;
                            return st ? (
                              <SkillBadge key={s.skillId} name={s.name} status={st} />
                            ) : (
                              <Badge key={s.skillId} variant="outline">
                                {s.name}
                              </Badge>
                            );
                          })}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={isFollowed ? "Deixar de seguir" : "Seguir empresa"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFollow.mutate({ companyId: company.companyId, follow: !isFollowed });
                            }}
                          >
                            {isFollowed ? (
                              <BellOff className="size-4" aria-hidden />
                            ) : (
                              <Bell className="size-4" aria-hidden />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openCompany(company)}
                          >
                            Ver
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Blueprint>
      )}

      {/* Sheet de detalhe da empresa */}
      <Sheet
        open={Boolean(selectedCompanyId)}
        onOpenChange={(open) => !open && setSelectedCompanyId(null)}
      >
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedCompanyName}</SheetTitle>
          </SheetHeader>
          <CompanyDetailPanel
            companyId={selectedCompanyId}
            companyName={selectedCompanyName}
            detail={detailQuery.data ?? null}
            monthly={monthlyQuery.data ?? null}
            detailLoading={detailQuery.isLoading}
            monthlyLoading={monthlyQuery.isLoading}
            gapStatusBySkill={gapStatusBySkill}
            isFollowed={selectedCompanyId ? followedSet.has(selectedCompanyId) : false}
            onToggleFollow={() => {
              if (!selectedCompanyId) return;
              const follow = !followedSet.has(selectedCompanyId);
              toggleFollow.mutate({ companyId: selectedCompanyId, follow });
            }}
            followPending={toggleFollow.isPending}
            company={sortedCompanies.find((c) => c.companyId === selectedCompanyId) ?? null}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Company Detail Panel ─────────────────────────────────────────────────────

function CompanyDetailPanel({
  companyId,
  companyName,
  detail,
  monthly,
  detailLoading,
  monthlyLoading,
  gapStatusBySkill,
  isFollowed,
  onToggleFollow,
  followPending,
  company,
}: {
  companyId: string | null;
  companyName: string;
  detail: import("@/lib/market.functions").CompanyDetail | null | undefined;
  monthly: import("@/lib/market.functions").CompanyMonthlyRow[] | null;
  detailLoading: boolean;
  monthlyLoading: boolean;
  gapStatusBySkill: Map<string, SkillStatus>;
  isFollowed: boolean;
  onToggleFollow: () => void;
  followPending: boolean;
  company: CompanyRankingItem | null;
}) {
  return (
    <div className="mt-4 flex flex-col gap-5">
      {/* Header da empresa */}
      <div className="flex flex-wrap items-center gap-3">
        {company?.website ? (
          <a
            href={company.website}
            target="_blank"
            rel="noopener noreferrer"
            className="caption inline-flex items-center gap-1 text-accent-700 underline"
          >
            <ExternalLink className="size-3" aria-hidden />
            {company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : null}
        {company?.industry ? <Badge variant="outline">{company.industry}</Badge> : null}
        <Button
          variant={isFollowed ? "default" : "outline"}
          size="sm"
          onClick={onToggleFollow}
          disabled={followPending}
        >
          {isFollowed ? (
            <>
              <BellOff className="mr-1 size-4" aria-hidden />
              Seguindo
            </>
          ) : (
            <>
              <Bell className="mr-1 size-4" aria-hidden />
              Seguir empresa
            </>
          )}
        </Button>
      </div>

      {/* Gráfico de contratações por mês */}
      {monthlyLoading ? (
        <LoadingState rows={3} label="Carregando histórico" />
      ) : (monthly?.length ?? 0) > 0 ? (
        <ChartCard title="Contratações por mês" description="Vagas publicadas nos últimos 6 meses.">
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(monthly ?? []).map((r) => ({ month: r.month.slice(0, 7), jobs: r.jobs }))}
                margin={{ left: 0, right: 8, top: 4, bottom: 4 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-divider)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="var(--color-divider)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--color-divider)" allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="jobs" fill="var(--color-accent-600)" radius={0} name="Vagas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      ) : null}

      {/* Skills match */}
      {detailLoading ? (
        <LoadingState rows={4} label="Carregando skills e vagas" />
      ) : detail ? (
        <>
          {/* Mini score */}
          <Blueprint className="p-4">
            <h6 className="text-neutral-700">Aderência ao seu perfil</h6>
            <p className="text-body mt-2">
              Você tem{" "}
              <span className="num font-semibold">{detail.userMatchCount}</span> de{" "}
              <span className="num font-semibold">{detail.skills.length}</span> skills principais que esta empresa
              pede.
            </p>
            {detail.skills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.skills.slice(0, 10).map((s) => {
                  const st = (gapStatusBySkill.get(s.skillId) as SkillStatus | undefined) ??
                    (s.userLevel > 0 ? "dominada" : "faltante");
                  return <SkillBadge key={s.skillId} name={s.name} status={st} />;
                })}
              </div>
            ) : null}
          </Blueprint>

          {/* Vagas abertas */}
          {detail.openJobs.length > 0 ? (
            <div>
              <h6 className="mb-2 text-neutral-700">Vagas abertas</h6>
              <div className="flex flex-col divide-y divide-divider">
                {detail.openJobs.map((job) => (
                  <div key={job.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium">{job.title}</p>
                      <div className="caption mt-0.5 flex gap-2 text-neutral-600">
                        {job.seniority ? <span>{job.seniority}</span> : null}
                        <span>{formatDate(job.postedAt)}</span>
                      </div>
                    </div>
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                    >
                      <Button variant="outline" size="sm">
                        <ExternalLink className="mr-1 size-3" aria-hidden />
                        Candidatar
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              title="Nenhuma vaga aberta"
              description="Neste recorte não encontramos vagas ativas desta empresa."
            />
          )}
        </>
      ) : (
        <EmptyState
          title="Sem dados disponíveis"
          description="Não há dados suficientes para este recorte."
        />
      )}
    </div>
  );
}
