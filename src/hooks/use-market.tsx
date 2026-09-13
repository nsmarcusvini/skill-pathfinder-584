import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type MarketSegment = "br" | "remoto_global";

export interface TrackOption {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
}

export const SEGMENT_LABEL: Record<MarketSegment, string> = {
  br: "Brasil (BRL)",
  remoto_global: "Remoto global (USD)",
};

export const SEGMENT_CURRENCY: Record<MarketSegment, "BRL" | "USD"> = {
  br: "BRL",
  remoto_global: "USD",
};

// Ordem crescente. É a MESMA lista do CHECK de seniority no banco e do
// SENIORITY_ORDER em gap.functions.ts (que usa o índice para achar níveis
// adjacentes ao alargar a busca) — as três precisam concordar.
export const SENIORITIES = ["estagiario", "trainee", "junior", "pleno", "senior", "staff"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const SENIORITY_LABEL: Record<Seniority, string> = {
  estagiario: "Estagiário",
  trainee: "Trainee",
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
  staff: "Staff",
};

export const PERIOD_OPTIONS = [30, 90, 180, 365] as const;
export const PERIOD_LABEL: Record<number, string> = {
  30: "Últimos 30 dias",
  90: "Últimos 90 dias",
  180: "Últimos 180 dias",
  365: "Últimos 12 meses",
};

const PERIOD_STORAGE_KEY = "rumvia:periodo";

/** Campo do recorte que está sendo trocado. Só muda a cópia — o efeito é o mesmo. */
export type CampoDoRecorte = "trilha" | "segmento" | "senioridade";

export interface MudancaDeRecorte {
  campo: CampoDoRecorte;
  /** Destino já em português: "Back-End", "Remoto global (USD)", "Sênior". */
  rotulo: string;
}

const ARTIGO_DO_CAMPO: Record<CampoDoRecorte, string> = {
  trilha: "a trilha",
  segmento: "o segmento",
  senioridade: "a senioridade",
};

interface MarketValue {
  tracks: TrackOption[];
  tracksLoading: boolean;
  trackId: string | null;
  track: TrackOption | null;
  segment: MarketSegment;
  currency: "BRL" | "USD";
  setTrackId: (trackId: string) => Promise<void>;
  setSegment: (segment: MarketSegment) => Promise<void>;
  seniority: Seniority;
  setSeniority: (seniority: Seniority) => Promise<void>;
  periodDays: number;
  setPeriodDays: (days: number) => void;
  /**
   * Troca de recorte em andamento, ou `null`.
   *
   * Enquanto não é `null`, TODO dado derivado em tela é do recorte ANTIGO —
   * a invalidação já saiu mas as consultas ainda não voltaram. Quem renderiza
   * precisa dizer isso ao usuário: sem aviso, a tela fica parada mostrando
   * número de outra trilha e o clique parece não ter funcionado.
   */
  mudando: MudancaDeRecorte | null;
}

const MarketContext = React.createContext<MarketValue | null>(null);

export function useTracks() {
  return useQuery({
    queryKey: ["career_tracks"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("career_tracks")
        .select("id, key, name, description, icon")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TrackOption[];
    },
  });
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const tracksQuery = useTracks();

  // O `?? []` cria um array novo a cada render, e um array novo derrubava o
  // useMemo do value — que é o que segura o re-render de TODA tela que lê o
  // contexto. Passou a doer agora que o provider também guarda o estado da
  // troca: eram dois renders por troca, cada um refazendo o contexto inteiro.
  const tracks = React.useMemo(() => tracksQuery.data ?? [], [tracksQuery.data]);
  const trackId = profile?.current_track_id ?? tracks[0]?.id ?? null;
  const segment: MarketSegment =
    profile?.target_region === "remoto_global" ? "remoto_global" : "br";
  const seniority = (SENIORITIES as readonly string[]).includes(profile?.seniority ?? "")
    ? (profile!.seniority as Seniority)
    : "pleno";

  const [periodDays, setPeriodDaysState] = React.useState<number>(90);
  React.useEffect(() => {
    const stored = Number(window.localStorage.getItem(PERIOD_STORAGE_KEY));
    if (PERIOD_OPTIONS.includes(stored as (typeof PERIOD_OPTIONS)[number])) {
      setPeriodDaysState(stored);
    }
  }, []);
  const setPeriodDays = React.useCallback(
    (days: number) => {
      window.localStorage.setItem(PERIOD_STORAGE_KEY, String(days));
      setPeriodDaysState(days);
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  /**
   * Troca em andamento. Guarda o DESTINO junto com o rótulo porque o seletor
   * precisa responder na hora: `trackId` sai de `profile.current_track_id`, que
   * só muda quando a consulta do perfil volta. Sem o valor otimista aqui, o
   * usuário escolhe "Back-End" e o campo continua escrito "DevOps" por um ou
   * dois segundos — o clique parece ter sido ignorado.
   */
  const [mudanca, setMudanca] = React.useState<{
    info: MudancaDeRecorte;
    trackId?: string;
    segment?: MarketSegment;
    seniority?: Seniority;
  } | null>(null);

  const persist = React.useCallback(
    async (
      patch: {
        current_track_id?: string;
        target_region?: MarketSegment;
        seniority?: Seniority;
      },
      info: MudancaDeRecorte,
    ) => {
      if (!user) return;

      setMudanca({
        info,
        ...(patch.current_track_id ? { trackId: patch.current_track_id } : {}),
        ...(patch.target_region ? { segment: patch.target_region } : {}),
        ...(patch.seniority ? { seniority: patch.seniority } : {}),
      });

      try {
        const profilePatch: {
          current_track_id?: string;
          target_region?: MarketSegment;
          seniority?: Seniority;
          target_currency?: string;
        } = { ...patch };
        if (patch.target_region) {
          profilePatch.target_currency = SEGMENT_CURRENCY[patch.target_region];
        }
        // `profiles` é a fonte do recorte que a interface lê. Se esta escrita
        // falhar, nada mudou de verdade — e seguir em frente deixaria a tela
        // recalculando para um recorte que o banco não tem.
        const { error: erroPerfil } = await supabase
          .from("profiles")
          .update(profilePatch)
          .eq("id", user.id);
        if (erroPerfil) throw new Error(erroPerfil.message);

        const prefPatch: {
          track_id?: string;
          market_segment?: string;
          region?: string;
          currency?: string;
          seniority_target?: string;
        } = {};
        if (patch.seniority) prefPatch.seniority_target = patch.seniority;
        if (patch.current_track_id) prefPatch.track_id = patch.current_track_id;
        if (patch.target_region) {
          prefPatch.market_segment = patch.target_region;
          prefPatch.region = patch.target_region;
          prefPatch.currency = SEGMENT_CURRENCY[patch.target_region];
        }
        if (Object.keys(prefPatch).length > 0) {
          const { error: erroPref } = await supabase
            .from("user_track_preferences")
            .update(prefPatch)
            .eq("user_id", user.id)
            .eq("is_primary", true);
          // Aqui NÃO reverte: o recorte que a tela lê já mudou em `profiles`.
          // Falhar a troca inteira por causa da tabela secundária diria ao
          // usuário que nada aconteceu quando tudo o que ele vê já mudou.
          if (erroPref) {
            console.warn(`[market] preferência secundária não atualizada: ${erroPref.message}`);
          }
        }

        // Trilha ou segmento mudou: todo cache derivado precisa ser refeito.
        // O await é o que sustenta o estado de carregamento — sem ele, o aviso
        // sumiria antes de o primeiro número novo chegar na tela.
        await queryClient.invalidateQueries();
      } catch (erro) {
        toast.error(`Não foi possível trocar ${ARTIGO_DO_CAMPO[info.campo]}`, {
          description: erro instanceof Error ? erro.message : "Tente de novo em instantes.",
        });
      } finally {
        setMudanca(null);
      }
    },
    [queryClient, user],
  );

  // Valores otimistas: durante a troca valem o destino, não o que ainda está
  // gravado no perfil. É o que faz o seletor responder ao clique na hora.
  const trackIdVisivel = mudanca?.trackId ?? trackId;
  const segmentVisivel = mudanca?.segment ?? segment;
  const seniorityVisivel = mudanca?.seniority ?? seniority;

  const value = React.useMemo<MarketValue>(
    () => ({
      tracks,
      tracksLoading: tracksQuery.isLoading,
      trackId: trackIdVisivel,
      track: tracks.find((t) => t.id === trackIdVisivel) ?? null,
      segment: segmentVisivel,
      currency: SEGMENT_CURRENCY[segmentVisivel],
      setTrackId: (id: string) =>
        persist(
          { current_track_id: id },
          { campo: "trilha", rotulo: tracks.find((t) => t.id === id)?.name ?? "a nova trilha" },
        ),
      setSegment: (s: MarketSegment) =>
        persist({ target_region: s }, { campo: "segmento", rotulo: SEGMENT_LABEL[s] }),
      seniority: seniorityVisivel,
      setSeniority: (s: Seniority) =>
        persist({ seniority: s }, { campo: "senioridade", rotulo: SENIORITY_LABEL[s] }),
      periodDays,
      setPeriodDays,
      mudando: mudanca?.info ?? null,
    }),
    [
      tracks,
      tracksQuery.isLoading,
      trackIdVisivel,
      segmentVisivel,
      seniorityVisivel,
      periodDays,
      setPeriodDays,
      persist,
      mudanca,
    ],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketValue {
  const ctx = React.useContext(MarketContext);
  if (!ctx) throw new Error("useMarket precisa estar dentro de <MarketProvider>");
  return ctx;
}
