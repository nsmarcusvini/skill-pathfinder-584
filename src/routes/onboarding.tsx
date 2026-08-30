import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { Blueprint } from "@/components/rumvia/blueprint";
import { PageHeader } from "@/components/rumvia/page-header";
import { LoadingState } from "@/components/rumvia/states";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMarket, SEGMENT_CURRENCY, type MarketSegment } from "@/hooks/use-market";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Onboarding — RUMVIA" },
      {
        name: "description",
        content:
          "Confirme sua trilha, senioridade e segmento de mercado para calibrar sua análise.",
      },
      { property: "og:title", content: "Onboarding — RUMVIA" },
      { property: "og:description", content: "Configure sua trilha de carreira no RUMVIA." },
    ],
  }),
  component: () => (
    <ProtectedRoute requireAccount>
      <OnboardingPage />
    </ProtectedRoute>
  ),
});

const SENIORIDADES = [
  { value: "junior", label: "Júnior" },
  { value: "pleno", label: "Pleno" },
  { value: "senior", label: "Sênior" },
  { value: "staff", label: "Staff" },
];

function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const market = useMarket();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Quem chegou pelo CV já tem trilha e senioridade inferidas: só confirmamos.
  const inferido = Boolean(profile?.current_track_id && profile?.seniority);

  const [step, setStep] = React.useState(1);
  const [trackId, setTrackId] = React.useState<string | null>(profile?.current_track_id ?? null);
  const [variantId, setVariantId] = React.useState<string | null>(null);
  const [seniority, setSeniority] = React.useState(profile?.seniority ?? "pleno");
  const [targetSeniority, setTargetSeniority] = React.useState("senior");
  const [years, setYears] = React.useState(String(profile?.years_experience ?? ""));
  const [segment, setSegment] = React.useState<MarketSegment>(market.segment);
  const [currency, setCurrency] = React.useState<"BRL" | "USD">(SEGMENT_CURRENCY[market.segment]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!trackId && market.tracks[0]) setTrackId(market.tracks[0].id);
  }, [market.tracks, trackId]);

  const variantsQuery = useQuery({
    queryKey: ["track_role_variants", trackId],
    enabled: Boolean(trackId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("track_role_variants")
        .select("id, name, key")
        .eq("track_id", trackId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const variants = variantsQuery.data ?? [];
  React.useEffect(() => {
    if (variants.length > 0 && !variants.some((v) => v.id === variantId)) {
      setVariantId(variants[0]!.id);
    }
  }, [variants, variantId]);

  async function finalizar() {
    if (!user || !trackId) return;
    setSaving(true);
    try {
      const { error: perfilErro } = await supabase
        .from("profiles")
        .update({
          current_track_id: trackId,
          seniority,
          years_experience: years ? Number(years) : null,
          target_region: segment,
          target_currency: currency,
          onboarding_completed: true,
        })
        .eq("id", user.id);
      if (perfilErro) throw perfilErro;

      await supabase
        .from("user_track_preferences")
        .update({ is_primary: false })
        .eq("user_id", user.id);

      const { error: prefErro } = await supabase.from("user_track_preferences").insert({
        user_id: user.id,
        track_id: trackId,
        role_variant_id: variantId,
        seniority_target: targetSeniority,
        region: segment,
        market_segment: segment,
        currency,
        is_primary: true,
      });
      if (prefErro) throw prefErro;

      await refreshProfile();
      await queryClient.invalidateQueries();
      toast.success("Tudo pronto. Bem-vindo ao RUMVIA.");
      void navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (market.tracksLoading) return <LoadingState label="Carregando trilhas…" />;

  const stepTrilha = (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="label-h6 text-neutral-700">Trilha de carreira</h2>
        {/* .card do design system não tem padding — sem p-4 o texto encosta na borda. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {market.tracks.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTrackId(t.id)}
              className={cn(
                "card flex min-h-28 cursor-pointer flex-col p-4 text-left transition-colors hover:border-accent-600",
                trackId === t.id && "border-accent-700 bg-accent-100",
              )}
            >
              <span className="label-h6 flex items-start justify-between gap-2 text-neutral-900">
                <span>{t.name}</span>
                {trackId === t.id ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
                ) : null}
              </span>
              {t.description ? (
                <span className="mt-2 block text-caption leading-relaxed text-neutral-700">
                  {t.description}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label-h6 text-neutral-700" htmlFor="variante">
          Variante
        </label>
        <select
          id="variante"
          className="field"
          value={variantId ?? ""}
          onChange={(e) => setVariantId(e.target.value)}
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  );

  const stepSenioridade = (
    <section className="grid gap-4 sm:grid-cols-3">
      <div>
        <label className="label-h6 text-neutral-700" htmlFor="sen-atual">
          Senioridade atual
        </label>
        <select
          id="sen-atual"
          className="field"
          value={seniority}
          onChange={(e) => setSeniority(e.target.value)}
        >
          {SENIORIDADES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-h6 text-neutral-700" htmlFor="sen-alvo">
          Senioridade-alvo
        </label>
        <select
          id="sen-alvo"
          className="field"
          value={targetSeniority}
          onChange={(e) => setTargetSeniority(e.target.value)}
        >
          {SENIORIDADES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-h6 text-neutral-700" htmlFor="anos">
          Anos de experiência
        </label>
        <Input
          id="anos"
          type="number"
          min={0}
          max={50}
          value={years}
          onChange={(e) => setYears(e.target.value)}
        />
      </div>
    </section>
  );

  const stepSegmento = (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="label-h6 text-neutral-700">Segmento de mercado primário</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[
            { value: "br" as const, label: "Brasil", hint: "Vagas no Brasil, salários em BRL" },
            {
              value: "remoto_global" as const,
              label: "Remoto global",
              hint: "Vagas internacionais, salários em USD",
            },
            {
              value: "ambos" as const,
              label: "Os dois",
              hint: "Você escolhe Brasil como primário e alterna quando quiser",
            },
          ].map((opt) => {
            const selected = opt.value === "ambos" ? false : segment === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const next: MarketSegment = opt.value === "ambos" ? "br" : opt.value;
                  setSegment(next);
                  setCurrency(SEGMENT_CURRENCY[next]);
                }}
                className={cn(
                  "card flex min-h-28 cursor-pointer flex-col p-4 text-left transition-colors hover:border-accent-600",
                  selected && "border-accent-700 bg-accent-100",
                )}
              >
                <span className="label-h6 flex items-start justify-between gap-2 text-neutral-900">
                  <span>{opt.label}</span>
                  {selected ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-accent-700" aria-hidden />
                  ) : null}
                </span>
                <span className="mt-2 block text-caption leading-relaxed text-neutral-700">
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="max-w-40">
        <label className="label-h6 text-neutral-700" htmlFor="moeda">
          Moeda
        </label>
        <select
          id="moeda"
          className="field"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as "BRL" | "USD")}
        >
          <option value="BRL">BRL</option>
          <option value="USD">USD</option>
        </select>
      </div>
    </section>
  );

  const stepCv = (
    <section className="flex flex-col gap-3">
      <p className="text-caption text-neutral-700">
        Envie seu currículo para extrairmos suas skills automaticamente. A leitura é por dicionário,
        sem IA — ela não inventa, mas também não adivinha. Você pode acrescentar à mão o que faltar
        depois.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void navigate({ to: "/cv" })}>
          Enviar CV
        </Button>
        <Button variant="ghost" onClick={finalizar} loading={saving}>
          Pular por enquanto
        </Button>
      </div>
    </section>
  );

  if (inferido) {
    return (
      <div className="rumvia-container py-10">
        <PageHeader
          eyebrow="Onboarding"
          title="Confirme seus dados"
          subtitle="Inferimos isto a partir do seu CV. Ajuste apenas o que estiver diferente."
        />
        <Blueprint className="mt-6 flex flex-col gap-6 p-6">
          {stepTrilha}
          {stepSenioridade}
          {stepSegmento}

          <div className="flex justify-end border-t border-divider pt-4">
            <Button onClick={finalizar} loading={saving}>
              Confirmar e ir para o dashboard
            </Button>
          </div>
        </Blueprint>
      </div>
    );
  }

  const passos = [stepTrilha, stepSenioridade, stepSegmento, stepCv];
  const titulos = ["Trilha", "Senioridade", "Segmento de mercado", "Currículo"];

  return (
    <div className="rumvia-container py-10">
      <PageHeader
        eyebrow={`Passo ${step} de 4`}
        title={titulos[step - 1] ?? ""}
        subtitle="Configuração inicial da sua análise."
      />
      <Blueprint className="mt-6 flex flex-col gap-6 p-6">
        {passos[step - 1]}
        <div className="flex items-center justify-between border-t border-divider pt-4">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
            Voltar
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!trackId}>
              Continuar
            </Button>
          ) : (
            <Button onClick={finalizar} loading={saving}>
              Concluir
            </Button>
          )}
        </div>
      </Blueprint>
    </div>
  );
}
