import { create } from "zustand";

export type Mode = "online" | "offline";
export type PanelId = string;

type PanelState = { id: PanelId; symbol?: string; timeframe: string; linkBySymbol: boolean };

type ChartStore = {
  mode: Mode;
  setMode: (m: Mode) => void;
  activePanelId: PanelId;
  setActivePanel: (id: PanelId) => void;
  panels: Record<PanelId, PanelState>;
};

export const useChartStore = create<ChartStore>((set) => ({
  mode: (typeof window !== "undefined" && (localStorage.getItem("mode") as Mode)) || "offline",
  setMode: (m) => { localStorage.setItem("mode", m); set({ mode: m }); },
  activePanelId: "p1",
  setActivePanel: (id) => set({ activePanelId: id }),
  panels: { p1: { id: "p1", timeframe: process.env.NEXT_PUBLIC_DEFAULT_TF || "5m", linkBySymbol: true } },
}));
