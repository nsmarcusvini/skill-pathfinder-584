import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

export const SENIORITIES = ["junior", "pleno", "senior", "staff"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const SENIORITY_LABEL: Record<Seniority, string> = {
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

  const tracks = tracksQuery.data ?? [];
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

  const persist = React.useCallback(
    async (patch: {
      current_track_id?: string;
      target_region?: MarketSegment;
      seniority?: Seniority;
    }) => {
      if (!user) return;

      const profilePatch: {
        current_track_id?: string;
        target_region?: MarketSegment;
        seniority?: Seniority;
        target_currency?: string;
      } = { ...patch };
      if (patch.target_region) {
        profilePatch.target_currency = SEGMENT_CURRENCY[patch.target_region];
      }
      await supabase.from("profiles").update(profilePatch).eq("id", user.id);

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
        await supabase
          .from("user_track_preferences")
          .update(prefPatch)
          .eq("user_id", user.id)
          .eq("is_primary", true);
      }

      // Trilha ou segmento mudou: todo cache derivado precisa ser refeito.
      await queryClient.invalidateQueries();
    },
    [queryClient, user],
  );

  const value = React.useMemo<MarketValue>(
    () => ({
      tracks,
      tracksLoading: tracksQuery.isLoading,
      trackId,
      track: tracks.find((t) => t.id === trackId) ?? null,
      segment,
      currency: SEGMENT_CURRENCY[segment],
      setTrackId: (id: string) => persist({ current_track_id: id }),
      setSegment: (s: MarketSegment) => persist({ target_region: s }),
      seniority,
      setSeniority: (s: Seniority) => persist({ seniority: s }),
      periodDays,
      setPeriodDays,
    }),
    [tracks, tracksQuery.isLoading, trackId, segment, seniority, periodDays, setPeriodDays, persist],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketValue {
  const ctx = React.useContext(MarketContext);
  if (!ctx) throw new Error("useMarket precisa estar dentro de <MarketProvider>");
  return ctx;
}
