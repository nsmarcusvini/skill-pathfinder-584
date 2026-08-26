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

interface MarketValue {
  tracks: TrackOption[];
  tracksLoading: boolean;
  trackId: string | null;
  track: TrackOption | null;
  segment: MarketSegment;
  currency: "BRL" | "USD";
  setTrackId: (trackId: string) => Promise<void>;
  setSegment: (segment: MarketSegment) => Promise<void>;
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

  const persist = React.useCallback(
    async (patch: { current_track_id?: string; target_region?: MarketSegment }) => {
      if (!user) return;

      const profilePatch: Record<string, string> = { ...patch };
      if (patch.target_region) {
        profilePatch["target_currency"] = SEGMENT_CURRENCY[patch.target_region];
      }
      await supabase.from("profiles").update(profilePatch).eq("id", user.id);

      const prefPatch: Record<string, string> = {};
      if (patch.current_track_id) prefPatch["track_id"] = patch.current_track_id;
      if (patch.target_region) {
        prefPatch["market_segment"] = patch.target_region;
        prefPatch["region"] = patch.target_region;
        prefPatch["currency"] = SEGMENT_CURRENCY[patch.target_region];
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
    }),
    [tracks, tracksQuery.isLoading, trackId, segment, persist],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketValue {
  const ctx = React.useContext(MarketContext);
  if (!ctx) throw new Error("useMarket precisa estar dentro de <MarketProvider>");
  return ctx;
}
