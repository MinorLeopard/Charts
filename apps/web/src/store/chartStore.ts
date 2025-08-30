import { create } from "zustand";

export type Mode = "online" | "offline";
export type PanelId = string;
export type WatchItem = { id: string; symbol: string; label?: string; tfDefault?: string; source: "local" | "db" | "mock" };

type PanelState = { id: PanelId; symbol?: string; timeframe: string; linkBySymbol: boolean };

type ChartStore = {
  mode: Mode;
  setMode: (m: Mode) => void;
  activePanelId: PanelId;
  setActivePanel: (id: PanelId) => void;
  panels: Record<PanelId, PanelState>;

  watchlist: WatchItem[];
  addToWatchlist: (it: WatchItem) => void;
  removeFromWatchlist: (id: string) => void;
};

const persisted = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("watchlist") || "[]") : [];

export const useChartStore = create<ChartStore>((set, get) => ({
  mode: (typeof window !== "undefined" && (localStorage.getItem("mode") as Mode)) || "offline",
  setMode: (m) => { if (typeof window !== "undefined") localStorage.setItem("mode", m); set({ mode: m }); },
  activePanelId: "p1",
  setActivePanel: (id) => set({ activePanelId: id }),
  panels: { p1: { id: "p1", timeframe: process.env.NEXT_PUBLIC_DEFAULT_TF || "5m", linkBySymbol: true } },

  watchlist: persisted,
  addToWatchlist: (it) => set((s) => {
    const exists = s.watchlist.some(w => w.symbol === it.symbol && w.source === it.source);
    const next = exists ? s.watchlist : [...s.watchlist, it];
    if (typeof window !== "undefined") localStorage.setItem("watchlist", JSON.stringify(next));
    return { watchlist: next };
  }),
  removeFromWatchlist: (id) => set((s) => {
    const next = s.watchlist.filter(w => w.id !== id);
    if (typeof window !== "undefined") localStorage.setItem("watchlist", JSON.stringify(next));
    return { watchlist: next };
  }),
}));
