import { create } from "zustand";

export type Mode = "online" | "offline";
export type PanelId = "p1" | "p2" | "p3" | "p4";
export type LayoutId = "1x1" | "2x1" | "2x2";

export type PanelState = {
  id: PanelId;
  symbol?: string;
  timeframe: string;
  linkBySymbol: boolean;
};

export type WatchItem = {
  id: string;
  symbol: string;
  label?: string;
  tfDefault?: string;
  source: "local" | "db" | "mock";
};

type ChartStore = {
  // modes & layout
  mode: Mode;
  setMode: (m: Mode) => void;
  layout: LayoutId;
  setLayout: (l: LayoutId) => void;

  // panels
  panels: Record<PanelId, PanelState>;
  activePanelId: PanelId;
  setActivePanel: (id: PanelId) => void;
  setPanelSymbol: (id: PanelId, symbol: string) => void;

  // watchlist
  watchlist: WatchItem[];
  addToWatchlist: (it: WatchItem) => void;
  removeFromWatchlist: (id: string) => void;
};

const DEFAULT_TF = process.env.NEXT_PUBLIC_DEFAULT_TF || "5m";

const initialPanels: Record<PanelId, PanelState> = {
  p1: { id: "p1", timeframe: DEFAULT_TF, linkBySymbol: true },
  p2: { id: "p2", timeframe: DEFAULT_TF, linkBySymbol: false },
  p3: { id: "p3", timeframe: DEFAULT_TF, linkBySymbol: false },
  p4: { id: "p4", timeframe: DEFAULT_TF, linkBySymbol: false },
};

const persistedPanels = typeof window !== "undefined" ? localStorage.getItem("panels") : null;
const persistedLayout = typeof window !== "undefined" ? (localStorage.getItem("layout") as LayoutId | null) : null;
const persistedMode = typeof window !== "undefined" ? (localStorage.getItem("mode") as Mode | null) : null;
const persistedWatch = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("watchlist") || "[]") as WatchItem[] : [];

export const useChartStore = create<ChartStore>((set, get) => ({
  // mode
  mode: persistedMode ?? "offline",
  setMode: (m) => {
    if (typeof window !== "undefined") localStorage.setItem("mode", m);
    set({ mode: m });
  },

  // layout
  layout: persistedLayout ?? "1x1",
  setLayout: (l) => {
    if (typeof window !== "undefined") localStorage.setItem("layout", l);
    set({ layout: l });
  },

  // panels
  panels: persistedPanels ? JSON.parse(persistedPanels) : initialPanels,
  activePanelId: "p1",
  setActivePanel: (id) => set({ activePanelId: id }),
  setPanelSymbol: (id, symbol) => {
    const next = { ...get().panels, [id]: { ...get().panels[id], symbol } };
    if (typeof window !== "undefined") localStorage.setItem("panels", JSON.stringify(next));
    set({ panels: next });
  },

  // watchlist
  watchlist: persistedWatch,
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
